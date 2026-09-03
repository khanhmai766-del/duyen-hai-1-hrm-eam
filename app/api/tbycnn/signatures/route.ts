import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { s3ProxyUrl } from "@/lib/s3";
import { positionLabelOf } from "@/lib/position-catalog";
import {
  canWriteRow,
  resolvePeriod,
  resolveTbycnnWriteScope,
  scopeWhere,
  signatureKeyOfUser,
  TBYCNN_ORDER_BY,
  TBYCNN_SIGNATURE_SETUP_URL,
} from "@/lib/tbycnn-service";

export const dynamic = "force-dynamic";

/**
 * KÝ XÁC NHẬN sổ TBYCNN — ký một lượt cho toàn bộ dòng thuộc cương vị của người ký.
 *
 * Quy trình giấy: đi kiểm tra xong, người phụ trách ký xác nhận cho phần thiết bị thuộc
 * cương vị mình. Bám đúng khuôn `app/api/pccc/signatures/bulk/route.ts`:
 *
 *  - `preview: true` → KHÔNG ghi gì, chỉ trả số liệu để hộp thoại xác nhận nói đúng
 *    bao nhiêu dòng sắp bị ghi tên mình vào, và người dùng đã có chữ ký số hay chưa.
 *  - PHẠM VI ký = phạm vi GHI (cương vị đang làm việc) GIAO với bộ lọc đang đặt trên
 *    màn hình. Gửi id ngoài phạm vi lên thì id đó rơi ra, không thành cửa ký vượt quyền.
 *  - Ký lại dòng đã ký = CẬP NHẬT chữ ký cũ, không đẻ bản ghi thứ hai.
 *
 * Chữ ký ở đây là ẢNH CHỮ KÝ SỐ trong hồ sơ cá nhân, không phải cái tên gõ ra — chặn cả
 * ở server chứ không chỉ ở hộp thoại.
 */

/** Trần số dòng gửi kèm bản xem trước — kỳ bất thường không biến hộp thoại thành trang vài MB. */
const MAX_PICK_ROWS = 800;

type Body = {
  preview?: boolean;
  period?: string;
  cuongViCode?: string;
  machine?: string;
  /** Dòng người dùng tick chọn; bỏ trống = ký toàn bộ phạm vi. */
  targetIds?: unknown;
};

function filterWhere(body: Body): Prisma.TbycnnEquipmentWhereInput {
  return {
    ...(body.cuongViCode ? { cuongViCode: body.cuongViCode } : {}),
    ...(body.machine ? { machine: body.machine } : {}),
  };
}

function describeScope(scope: { all: boolean; codes: string[] }, cuongViCode?: string) {
  if (cuongViCode) return positionLabelOf(cuongViCode);
  if (scope.all) return "toàn phân xưởng";
  return scope.codes.map((c) => positionLabelOf(c)).join(", ") || "—";
}

// POST /api/tbycnn/signatures  { preview?, period?, cuongViCode?, machine?, targetIds? }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolveTbycnnWriteScope(user, "Không đủ quyền ký sổ TBYCNN");

    const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
    const period = await resolvePeriod(body.period);
    if (period.isClosed) throw fail(`Kỳ ${period.label} đã chốt sổ, không ký thêm được`, 409);

    const where: Prisma.TbycnnEquipmentWhereInput = {
      periodId: period.id,
      ...scopeWhere(scope),
      ...filterWhere(body),
    };

    const scoped = await prisma.tbycnnEquipment.findMany({
      where,
      orderBy: TBYCNN_ORDER_BY,
      select: { id: true, tenThietBi: true, khuVuc: true, cuongVi: true, machine: true, maHieu: true },
    });
    const scopedIds = scoped.map((r) => r.id);

    const picked = Array.isArray(body.targetIds)
      ? (body.targetIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : null;
    const pickedSet = picked && picked.length ? new Set(picked) : null;
    // Luôn GIAO với tập trong phạm vi: id của cương vị khác gửi lên thì rơi ra ngoài.
    const ids = pickedSet ? scopedIds.filter((id) => pickedSet.has(id)) : scopedIds;

    const [alreadySigned, signatureKey] = await Promise.all([
      prisma.tbycnnSignature.count({ where: { equipmentId: { in: ids } } }),
      signatureKeyOfUser(user.id),
    ]);

    if (body.preview) {
      const rows = scopedIds.length <= MAX_PICK_ROWS ? scoped : [];
      const signedIds = new Set(
        (
          await prisma.tbycnnSignature.findMany({
            where: { equipmentId: { in: rows.map((r) => r.id) } },
            select: { equipmentId: true },
          })
        ).map((r) => r.equipmentId)
      );
      return ok({
        total: scopedIds.length,
        alreadySigned,
        willSign: ids.length,
        rows: rows.map((r) => ({
          id: r.id,
          label: r.tenThietBi,
          code: r.maHieu ?? "",
          cuongVi: r.cuongVi ?? r.khuVuc,
          machine: r.machine,
          signed: signedIds.has(r.id),
        })),
        rowsTruncated: scopedIds.length > MAX_PICK_ROWS,
        scopeLabel: describeScope(scope, body.cuongViCode),
        periodLabel: period.label,
        signerName: user.name ?? user.email ?? "",
        hasSignature: Boolean(signatureKey),
        signatureSetupUrl: TBYCNN_SIGNATURE_SETUP_URL,
      });
    }

    if (!signatureKey) {
      return fail(
        `Tài khoản của bạn chưa có chữ ký số. Vào ${TBYCNN_SIGNATURE_SETUP_URL} → mục "Chữ ký số" để thêm rồi ký lại.`,
        409
      );
    }
    if (ids.length === 0) {
      return fail(
        pickedSet ? "Các dòng đã chọn không nằm trong phạm vi ký của bạn" : "Không có dòng nào thuộc phạm vi ký của bạn",
        409
      );
    }

    const signedAt = new Date();
    const signerName = user.name ?? user.email ?? "";
    const signerPosition = user.currentPosition ?? user.position ?? null;

    await prisma.$transaction([
      prisma.tbycnnSignature.deleteMany({ where: { equipmentId: { in: ids } } }),
      prisma.tbycnnSignature.createMany({
        data: ids.map((equipmentId) => ({
          periodId: period.id,
          equipmentId,
          userId: user.id,
          signerName,
          signerPosition,
          signatureKey,
          signedAt,
        })),
      }),
    ]);

    await audit(
      user.id,
      "SIGN_TBYCNN_BULK",
      "TbycnnPeriod",
      period.id,
      auditDetailWithPosition(
        user,
        `Ký ${ids.length}${pickedSet ? `/${scopedIds.length} (chọn riêng)` : ""} dòng TBYCNN · ${period.label} · ${describeScope(scope, body.cuongViCode)}`
      ),
      { saveToAuditLog: true }
    );

    return ok({
      signed: ids.length,
      resigned: alreadySigned,
      signerName,
      signedAt: signedAt.toISOString(),
      signatureUrl: s3ProxyUrl(signatureKey, "chu-ky.png"),
      scopeLabel: describeScope(scope, body.cuongViCode),
      periodLabel: period.label,
    });
  });
}

// DELETE /api/tbycnn/signatures { equipmentId } -> huỷ ký một dòng
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolveTbycnnWriteScope(user, "Không đủ quyền huỷ ký sổ TBYCNN");

    const { equipmentId } = ((await req.json().catch(() => ({}))) ?? {}) as { equipmentId?: string };
    if (!equipmentId) throw fail("Thiếu equipmentId", 400);

    const row = await prisma.tbycnnEquipment.findUnique({
      where: { id: equipmentId },
      include: { period: { select: { label: true, isClosed: true } } },
    });
    if (!row) throw fail("Không tìm thấy thiết bị", 404);
    if (row.period.isClosed) throw fail(`Kỳ ${row.period.label} đã chốt sổ, chỉ xem được`, 409);
    if (!canWriteRow(scope, row)) throw fail("Thiết bị này không thuộc cương vị quản lý của bạn", 403);

    await prisma.tbycnnSignature.deleteMany({ where: { equipmentId } });
    await audit(
      user.id,
      "UNSIGN_TBYCNN",
      "TbycnnEquipment",
      equipmentId,
      auditDetailWithPosition(user, `Huỷ ký "${row.tenThietBi}" · ${row.period.label}`)
    );
    return ok({ equipmentId });
  });
}
