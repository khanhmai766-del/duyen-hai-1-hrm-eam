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
import { isPcccLightLoai } from "@/lib/pccc-status";
import { s3ProxyUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * KÝ THEO CÁC THIẾT BỊ ĐÃ ĐÁNH DẤU trong phiên kiểm tra.
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
 *
 * KHÔNG có ở đây: bồn Foam/CO2/Diesel và hai bảng FM200. Hai thứ đó chỉ vài dòng và ký
 * từng mục ngay trong tab của chúng, không cần ký gộp theo cương vị.
 */

type BulkTarget = "EXTINGUISHER" | "CABINET" | "ALARM_BUTTON" | "VALVE" | "EMERGENCY_LIGHT" | "HOSE_REEL" | "FIRE_CONTROL_CABINET";

type StampData = { nguoiKiemTra: string; ngayKiemTra: Date };

/** Một dòng để hộp thoại bày ra cho người dùng tick chọn. */
type PickRow = { id: string; code: string; label: string; ngayKiemTra: string | null };

/**
 * Số dòng tối đa gửi kèm bản xem trước.
 *
 * Cương vị nhiều bình nhất hiện chưa tới 200 dòng; đặt trần để một kỳ dữ liệu bất
 * thường không biến hộp thoại thành trang tải vài MB. Vượt trần vẫn ký đúng danh sách
 * id client gửi lên, chỉ là không bày toàn bộ danh sách để rà soát trong hộp thoại.
 */
const MAX_PICK_ROWS = 500;

const joinLabel = (...parts: Array<string | null | undefined>) =>
  parts.map((x) => (x ?? "").trim()).filter(Boolean).join(" · ");

/**
 * Sáu bảng ký gộp được. Bảng tra thay cho chuỗi if/else: mỗi bảng chỉ khác nhau ở
 * delegate Prisma và nhãn ghi vào nhật ký, phần còn lại của luồng ký là một.
 */
const BULK_TARGETS: Record<
  BulkTarget,
  {
    label: string;
    findIds: (where: Record<string, unknown>) => Promise<{ id: string }[]>;
    listRows: (where: Record<string, unknown>) => Promise<PickRow[]>;
    stamp: (ids: string[], data: StampData) => Prisma.PrismaPromise<unknown>;
  }
> = {
  EXTINGUISHER: {
    label: "bình chữa cháy",
    findIds: (where) => prisma.pcccExtinguisher.findMany({ where: where as Prisma.PcccExtinguisherWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccExtinguisher.findMany({
        where: where as Prisma.PcccExtinguisherWhereInput,
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, ma: true, chungLoai: true, viTri: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.ma, label: joinLabel(r.chungLoai, r.viTri), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccExtinguisher.updateMany({ where: { id: { in: ids } }, data }),
  },
  CABINET: {
    label: "tủ chữa cháy",
    findIds: (where) => prisma.pcccCabinet.findMany({ where: where as Prisma.PcccCabinetWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccCabinet.findMany({
        where: where as Prisma.PcccCabinetWhereInput,
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, ma: true, ten: true, viTri: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.ma, label: joinLabel(r.ten, r.viTri), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccCabinet.updateMany({ where: { id: { in: ids } }, data }),
  },
  ALARM_BUTTON: {
    label: "nút nhấn báo cháy",
    findIds: (where) => prisma.pcccAlarmButton.findMany({ where: where as Prisma.PcccAlarmButtonWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccAlarmButton.findMany({
        where: where as Prisma.PcccAlarmButtonWhereInput,
        orderBy: [{ stt: "asc" }, { maKks: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, maKks: true, tenKhuVuc: true, viTri: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.maKks, label: joinLabel(r.tenKhuVuc, r.viTri), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccAlarmButton.updateMany({ where: { id: { in: ids } }, data }),
  },
  VALVE: {
    label: "van chữa cháy",
    findIds: (where) => prisma.pcccValve.findMany({ where: where as Prisma.PcccValveWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccValve.findMany({
        where: where as Prisma.PcccValveWhereInput,
        orderBy: [{ stt: "asc" }, { maKks: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, maKks: true, tenVan: true, viTri: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.maKks, label: joinLabel(r.tenVan, r.viTri), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccValve.updateMany({ where: { id: { in: ids } }, data }),
  },
  EMERGENCY_LIGHT: {
    label: "đèn sự cố",
    findIds: (where) => prisma.pcccEmergencyLight.findMany({ where: where as Prisma.PcccEmergencyLightWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccEmergencyLight.findMany({
        where: where as Prisma.PcccEmergencyLightWhereInput,
        orderBy: [{ stt: "asc" }, { maKks: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, maKks: true, tenKhuVuc: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.maKks, label: joinLabel(r.tenKhuVuc), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccEmergencyLight.updateMany({ where: { id: { in: ids } }, data }),
  },
  HOSE_REEL: {
    label: "cuộn vòi chữa cháy",
    findIds: (where) => prisma.pcccHoseReel.findMany({ where: where as Prisma.PcccHoseReelWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccHoseReel.findMany({
        where: where as Prisma.PcccHoseReelWhereInput,
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, ma: true, ten: true, viTri: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.ma, label: joinLabel(r.ten, r.viTri), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccHoseReel.updateMany({ where: { id: { in: ids } }, data }),
  },
  FIRE_CONTROL_CABINET: {
    label: "tủ điều khiển chữa cháy",
    findIds: (where) => prisma.pcccFireControlCabinet.findMany({ where: where as Prisma.PcccFireControlCabinetWhereInput, select: { id: true } }),
    listRows: async (where) =>
      (await prisma.pcccFireControlCabinet.findMany({
        where: where as Prisma.PcccFireControlCabinetWhereInput,
        orderBy: [{ stt: "asc" }, { ma: "asc" }],
        take: MAX_PICK_ROWS,
        select: { id: true, ma: true, viTri: true, ngayKiemTra: true },
      })).map((r) => ({ id: r.id, code: r.ma, label: joinLabel(r.viTri), ngayKiemTra: r.ngayKiemTra?.toISOString() ?? null })),
    stamp: (ids, data) => prisma.pcccFireControlCabinet.updateMany({ where: { id: { in: ids } }, data }),
  },
};

function isBulkTarget(value: unknown): value is BulkTarget {
  return typeof value === "string" && value in BULK_TARGETS;
}

function whereOf(
  periodId: string,
  scope: PcccWriteScope,
  cuongVi?: string | null,
  machine?: string | null,
  loai?: string | null
): Record<string, unknown> {
  // Phạm vi GHI đóng luôn vai trò phạm vi lọc: `scopeWhere` GIAO bộ lọc đang đặt trên
  // màn hình với phạm vi, nên người mức `personal` gửi lên cương vị của người khác thì
  // ra tập rỗng — chứ không phải bị bỏ qua bộ lọc rồi ký cả phần của mình.
  return {
    periodId,
    ...scopeWhere(cuongVi, machine, scope),
    // Hai loại đèn nằm chung một bảng: thiếu `loai` thì ký đèn EXIT sẽ ký luôn cả đèn
    // chiếu sáng sự cố — người dùng chỉ vừa đi kiểm tra một trong hai.
    ...(loai ? { loai } : {}),
  };
}

/** Nhãn cương vị của tập dòng sắp ký — để hộp thoại xác nhận nói rõ đang ký cho ai. */
function describeScope(scope: PcccWriteScope, cuongVi?: string | null) {
  if (cuongVi && cuongVi !== "ALL") return positionLabelOf(cuongVi);
  if (!scope.all) return scope.codes.map((c) => positionLabelOf(c)).join(" · ");
  return "tất cả cương vị";
}

// POST /api/pccc/signatures/bulk { targetType, period?, cuongVi?, machine?, loai?, preview? }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();

    const body = (await req.json().catch(() => ({}))) as {
      targetType?: string;
      period?: string;
      cuongVi?: string;
      machine?: string;
      /** Chỉ dùng cho EMERGENCY_LIGHT: "EXIT" | "CSSC". */
      loai?: string;
      preview?: boolean;
      /** Danh sách bắt buộc khi ký thật: chỉ thiết bị đã đánh dấu kiểm tra trong phiên. */
      targetIds?: string[];
    };
    if (!isBulkTarget(body.targetType)) {
      return fail(`targetType phải là một trong: ${Object.keys(BULK_TARGETS).join(", ")}`);
    }
    const targetType = body.targetType;
    const target = BULK_TARGETS[targetType];

    // Bảng đèn BẮT BUỘC nói rõ loại — xem ghi chú trong whereOf.
    if (targetType === "EMERGENCY_LIGHT" && !isPcccLightLoai(body.loai)) {
      return fail("Ký đèn sự cố phải nói rõ loại (EXIT hoặc CSSC)");
    }
    const loai = targetType === "EMERGENCY_LIGHT" ? (body.loai as string) : null;

    // Đọc body TRƯỚC khi tính phạm vi: bảng Tủ chữa cháy (và cuộn vòi đi theo nó) có
    // cương vị được giao trọn bảng — xem lib/pccc-service.ts — nên phạm vi ký khác nhau
    // theo `targetType`.
    const scope = await resolvePcccWriteScope(user, "Không đủ quyền ký", targetType);

    const period = await resolvePeriod(body.period);
    assertPeriodWritable(period);

    const where = whereOf(period.id, scope, body.cuongVi, body.machine, loai);
    const scopedIds = (await target.findIds(where)).map((r) => r.id);

    /**
     * Danh sách client gửi lên chỉ có quyền THU HẸP, không mở rộng.
     *
     * Luôn giao với tập trong phạm vi: gửi id của cương vị khác lên thì id đó rơi ra
     * ngoài, chứ không thành một cửa ký vượt quyền.
     */
    const picked = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : null;
    if (!body.preview && (!picked || picked.length === 0)) {
      return fail("Chưa chọn thiết bị đã kiểm tra. Hãy tick từng dòng tại cột Người kiểm tra trước khi ký.", 409);
    }
    const pickedSet = picked ? new Set(picked) : null;
    const ids = pickedSet ? scopedIds.filter((id) => pickedSet.has(id)) : scopedIds;

    const [alreadySigned, signatureKey] = await Promise.all([
      prisma.pcccSignature.count({ where: { periodId: period.id, targetType, targetId: { in: ids } } }),
      signatureKeyOfUser(user.id),
    ]);

    // Xem trước: KHÔNG ghi gì, chỉ trả số liệu để hộp thoại xác nhận nói đúng sự thật —
    // kể cả việc người dùng chưa có chữ ký số, để hộp thoại nhắc TRƯỚC khi bấm xác nhận
    // thay vì để họ bấm rồi mới ăn lỗi.
    if (body.preview) {
      // Kèm danh sách để hộp thoại bày ra cho tick chọn. Dòng nào đã ký kỳ này thì đánh
      // dấu sẵn, người ký ngày thứ hai chỉ việc lọc lấy phần chưa ký.
      const rows = scopedIds.length <= MAX_PICK_ROWS ? await target.listRows(where) : [];
      const signedIds = new Set(
        (await prisma.pcccSignature.findMany({
          where: { periodId: period.id, targetType, targetId: { in: rows.map((r) => r.id) } },
          select: { targetId: true },
        })).map((r) => r.targetId)
      );
      return ok({
        total: scopedIds.length,
        alreadySigned,
        willSign: ids.length,
        rows: rows.map((r) => ({ ...r, signed: signedIds.has(r.id) })),
        rowsTruncated: scopedIds.length > MAX_PICK_ROWS,
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
    if (ids.length === 0) {
      return fail(
        pickedSet
          ? "Các dòng đã chọn không nằm trong phạm vi ký của bạn"
          : "Không có dòng nào thuộc phạm vi ký của bạn",
        409
      );
    }

    const signedAt = new Date();
    const signerName = user.name ?? user.email ?? "";
    const signerPosition = user.position ?? null;

    await prisma.$transaction([
      // Ghi người/ngày kiểm tra TRƯỚC, chữ ký sau — trong cùng transaction nên không có
      // khoảnh khắc nào dòng đã ký mà chưa có người kiểm tra.
      target.stamp(ids, { nguoiKiemTra: signerName, ngayKiemTra: signedAt }),
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
        `Ký ${ids.length}${pickedSet ? `/${scopedIds.length} (chọn riêng)` : ""} dòng ${target.label}${loai ? ` (${loai})` : ""} · ` +
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
