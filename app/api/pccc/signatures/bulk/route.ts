import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  assertPeriodWritable,
  resolvePcccWriteScope,
  resolvePeriod,
  scopeWhere,
  signatureKeyOfUser,
  PCCC_SIGNATURE_SETUP_URL,
  type PcccWriteScope,
} from "@/lib/pccc-service";
import { positionLabelOf } from "@/lib/position-catalog";
import { s3ProxyUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * KÝ HÀNG LOẠT theo cương vị — thay cho việc bấm ký từng dòng trong bảng nghìn dòng.
 *
 * Quy trình giấy: đi kiểm tra xong, người phụ trách ký xác nhận cho TOÀN BỘ phần thiết
 * bị thuộc cương vị mình. Nên một chữ ký ở đây kéo theo ba thứ được ghi cùng lúc, trong
 * MỘT transaction:
 *   1. bản ghi chữ ký (thẻ "Chữ ký": chưa ký → đã ký)
 *   2. `nguoiKiemTra` = họ tên người bấm
 *   3. `ngayKiemTra`  = ngày bấm xác nhận
 *
 * Ba thứ đó phải đi cùng nhau: ký mà không ghi người/ngày kiểm tra thì tháng sau không
 * ai biết ai đã đi kiểm tra và kiểm tra hôm nào.
 *
 * PHẠM VI ký = phạm vi GHI (`resolvePcccWriteScope`) giao với bộ lọc cương vị/tổ máy
 * đang đặt trên màn hình. Người mức `personal` chỉ ký được cương vị của mình; người
 * mức quản lý ký được mọi cương vị nhưng vẫn nên lọc trước — vì vậy có `preview`.
 */

type Target = "EXTINGUISHER" | "CABINET";

function whereOf(periodId: string, scope: PcccWriteScope, cuongVi?: string | null, machine?: string | null) {
  // Phạm vi GHI đóng luôn vai trò phạm vi lọc: `scopeWhere` GIAO bộ lọc đang đặt trên
  // màn hình với phạm vi, nên người mức `personal` gửi lên cương vị của người khác thì
  // ra tập rỗng — chứ không phải bị bỏ qua bộ lọc rồi ký cả phần của mình.
  const where: Prisma.PcccExtinguisherWhereInput = { periodId, ...scopeWhere(cuongVi, machine, scope) };
  return where;
}

/** Nhãn cương vị của tập dòng sắp ký — để hộp thoại xác nhận nói rõ đang ký cho ai. */
function describeScope(scope: PcccWriteScope, cuongVi?: string | null) {
  if (cuongVi && cuongVi !== "ALL") return positionLabelOf(cuongVi);
  if (!scope.all) return scope.codes.map((c) => positionLabelOf(c)).join(" · ");
  return "tất cả cương vị";
}

// POST /api/pccc/signatures/bulk { targetType, period?, cuongVi?, machine?, preview? }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, "Không đủ quyền ký");

    const body = (await req.json().catch(() => ({}))) as {
      targetType?: Target;
      period?: string;
      cuongVi?: string;
      machine?: string;
      preview?: boolean;
    };
    if (body.targetType !== "EXTINGUISHER" && body.targetType !== "CABINET") {
      return fail("targetType phải là EXTINGUISHER hoặc CABINET");
    }
    const targetType = body.targetType;

    const period = await resolvePeriod(body.period);
    assertPeriodWritable(period);

    const where = whereOf(period.id, scope, body.cuongVi, body.machine);
    const rows =
      targetType === "EXTINGUISHER"
        ? await prisma.pcccExtinguisher.findMany({ where, select: { id: true } })
        : await prisma.pcccCabinet.findMany({ where: where as Prisma.PcccCabinetWhereInput, select: { id: true } });
    const ids = rows.map((r) => r.id);

    const [alreadySigned, signatureKey] = await Promise.all([
      prisma.pcccSignature.count({ where: { periodId: period.id, targetType, targetId: { in: ids } } }),
      signatureKeyOfUser(user.id),
    ]);

    // Xem trước: KHÔNG ghi gì, chỉ trả số liệu để hộp thoại xác nhận nói đúng sự thật —
    // kể cả việc người dùng chưa có chữ ký số, để hộp thoại nhắc TRƯỚC khi bấm xác nhận
    // thay vì để họ bấm rồi mới ăn lỗi.
    if (body.preview) {
      return ok({
        total: ids.length,
        alreadySigned,
        willSign: ids.length,
        scopeLabel: describeScope(scope, body.cuongVi),
        periodLabel: period.label,
        signerName: user.name ?? user.email ?? "",
        hasSignature: Boolean(signatureKey),
        signatureSetupUrl: PCCC_SIGNATURE_SETUP_URL,
      });
    }

    // Chặn ở server nữa, không chỉ ở hộp thoại: chữ ký là bằng chứng ai đã đi kiểm tra,
    // ghi mỗi cái tên thì không khác gì gõ tay.
    if (!signatureKey) {
      return fail(
        `Tài khoản của bạn chưa có chữ ký số. Vào ${PCCC_SIGNATURE_SETUP_URL} → mục "Chữ ký số" để thêm rồi ký lại.`,
        409
      );
    }
    if (ids.length === 0) return fail("Không có dòng nào thuộc phạm vi ký của bạn", 409);

    const signedAt = new Date();
    const signerName = user.name ?? user.email ?? "";
    const signerPosition = user.position ?? null;

    await prisma.$transaction([
      // Ghi người/ngày kiểm tra TRƯỚC, chữ ký sau — trong cùng transaction nên không có
      // khoảnh khắc nào dòng đã ký mà chưa có người kiểm tra.
      targetType === "EXTINGUISHER"
        ? prisma.pcccExtinguisher.updateMany({
            where: { id: { in: ids } },
            data: { nguoiKiemTra: signerName, ngayKiemTra: signedAt },
          })
        : prisma.pcccCabinet.updateMany({
            where: { id: { in: ids } },
            data: { nguoiKiemTra: signerName, ngayKiemTra: signedAt },
          }),
      // Ký lại dòng đã ký = cập nhật chữ ký cũ, không đẻ bản ghi thứ hai.
      prisma.pcccSignature.deleteMany({ where: { targetType, targetId: { in: ids } } }),
      prisma.pcccSignature.createMany({
        data: ids.map((targetId) => ({
          periodId: period.id,
          targetType,
          targetId,
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
      "SIGN_PCCC_BULK",
      "PcccPeriod",
      period.id,
      auditDetailWithPosition(
        user,
        `Ký ${ids.length} dòng ${targetType === "EXTINGUISHER" ? "bình chữa cháy" : "tủ chữa cháy"} · ` +
          `${period.label} · ${describeScope(scope, body.cuongVi)}`
      ),
      { saveToAuditLog: true }
    );

    return ok({
      signed: ids.length,
      resigned: alreadySigned,
      signerName,
      signedAt: signedAt.toISOString(),
      signatureUrl: s3ProxyUrl(signatureKey, "chu-ky.png"),
      scopeLabel: describeScope(scope, body.cuongVi),
      periodLabel: period.label,
    });
  });
}
