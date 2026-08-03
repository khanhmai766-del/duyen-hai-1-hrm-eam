import type { Prisma, PrismaClient } from "@prisma/client";
import { positionCodeOf, positionsMatch } from "@/lib/position-catalog";
import { MAX_DEFECT_RELATED_DEVICES } from "@/lib/defect-related-devices";
import { buildReplacementLogData } from "@/lib/material-replacement-log";

/** Tối đa 1 thiết bị chính + N thiết bị liên quan trong cùng một SYC. */
export const MAX_MATERIAL_REQUEST_POINTS = MAX_DEFECT_RELATED_DEVICES + 1;

const POINT_SELECT = {
  id: true,
  materialId: true,
  deviceSeq: true,
  machine: true,
  system: true,
  location: true,
  quantity: true,
  deviceCount: true,
  intervalMonths: true,
  intervalNote: true,
  lastReplacedAt: true,
  managingPosition: true,
  managingPositionCode: true,
  isActive: true,
  material: { select: { id: true, name: true, code: true, unit: true, category: true } },
  device: { select: { seq: true, name: true, parentSeq: true } },
} satisfies Prisma.MaterialReplacementSelect;

export type MaterialRequestPoint = Prisma.MaterialReplacementGetPayload<{ select: typeof POINT_SELECT }>;

export type ResolvedMaterialRequest = {
  points: MaterialRequestPoint[];
  /** Tổ máy của phiếu, lấy từ danh mục — S1 | S2 | COMMON. */
  unit: string;
  /** Cương vị quản lý (nhãn hiển thị) và mã cương vị ổn định. */
  managingPosition: string | null;
  positionCode: string | null;
  /** Thiết bị chính = node của điểm đầu tiên; có thể là THƯ MỤC với SYC thay thế. */
  primarySeq: string;
  primaryName: string;
  /** Các node còn lại → thiết bị liên quan của phiếu. */
  relatedSeqs: string[];
  /** Nội dung gợi ý, người dùng vẫn sửa được trước khi lưu. */
  suggestedContent: string;
  /** Dòng snapshot ghi vào DefectMaterialRequest. */
  rows: Array<{
    replacementId: string;
    materialId: string;
    quantity: number;
    unitLabel: string;
    pointLabel: string;
  }>;
};

const numberVi = new Intl.NumberFormat("vi-VN");

function systemLabelOf(point: MaterialRequestPoint) {
  return (point.system || "").trim();
}

function deviceLabelOf(point: MaterialRequestPoint) {
  return (point.device?.name || point.location || "").trim();
}

/** "TRẠM DẦU BÔI TRƠN HP-LP · Bồn dầu LP/HP thùng nghiền A" */
export function pointLabelOf(point: MaterialRequestPoint) {
  const parts = [systemLabelOf(point), deviceLabelOf(point)].filter(Boolean);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(" · ") || "Chưa xác định vị trí";
}

function totalQuantityOf(point: MaterialRequestPoint) {
  return Math.max(0, point.quantity) * Math.max(1, point.deviceCount || 1);
}

function dateVi(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

/**
 * Nội dung khiếm khuyết gợi ý cho SYC thay thế vật tư.
 * Một điểm → một câu; nhiều điểm → câu tổng + danh sách gạch đầu dòng.
 */
export function buildMaterialRequestContent(points: MaterialRequestPoint[]) {
  if (points.length === 0) return "";
  const materialName = points[0].material.name;
  const unitLabel = points[0].material.unit;
  const total = points.reduce((sum, point) => sum + totalQuantityOf(point), 0);

  if (points.length === 1) {
    const point = points[0];
    const detail = [
      point.intervalMonths > 0 ? `chu kỳ ${point.intervalMonths} tháng` : null,
      point.intervalNote ? `O&M ${point.intervalNote}` : null,
      dateVi(point.lastReplacedAt) ? `lần thay gần nhất ${dateVi(point.lastReplacedAt)}` : null,
    ].filter(Boolean).join(", ");
    return `Thay thế ${materialName} — ${numberVi.format(total)} ${unitLabel} tại ${pointLabelOf(point)}${detail ? ` (${detail})` : ""}.`;
  }

  const lines = points.map(
    (point) => `- ${pointLabelOf(point)}: ${numberVi.format(totalQuantityOf(point))} ${unitLabel}`
  );
  return [
    `Thay thế ${materialName} cho ${points.length} vị trí — tổng ${numberVi.format(total)} ${unitLabel}:`,
    ...lines,
  ].join("\n");
}

const LOG_SOURCE_SELECT = {
  id: true,
  materialId: true,
  deviceSeq: true,
  machine: true,
  system: true,
  location: true,
  managingPosition: true,
  intervalMonths: true,
  intervalNote: true,
  material: { select: { unit: true } },
  device: { select: { name: true, parentSeq: true } },
} satisfies Prisma.MaterialReplacementSelect;

/**
 * Đóng vòng lặp khi SYC thay thế được xác nhận hoàn thành.
 *
 * Tách đôi hai việc trước đây bị buộc chung:
 *  1. GHI LỊCH SỬ — luôn chạy, vì đó là sự thật đã xảy ra. Dòng log mang đủ snapshot
 *     nên đọc được kể cả khi không có điểm theo dõi nào, hoặc điểm bị xoá về sau.
 *  2. GỠ ĐIỂM THEO DÕI — chỉ khi tìm được điểm đang theo dõi khớp vật tư + thiết bị.
 *     Dùng đúng vòng đời của app: ghi nhận xong thì điểm rời danh sách theo dõi
 *     (isActive=false), dòng khai báo hiện lại nút "Thêm điểm" để nạp chu kỳ mới.
 *
 * Log CHỈ neo vào điểm đang theo dõi. Không có thì `replacementId = null` — snapshot
 * đã đủ để hiển thị. Không được neo vào dòng khai báo: bảng "Chi tiết điểm thay thế"
 * lọc `_count.logs === 0` nên làm vậy là dòng khai báo biến mất khỏi danh mục.
 *
 * Trả về { logged, released } để nơi gọi báo lại cho người dùng.
 */
export async function recordMaterialRequestReplacements(
  tx: Prisma.TransactionClient,
  params: {
    defectId: string;
    userId: string;
    replacedAt: Date;
    defect?: { id: string; requestNumber: string | null } | null;
    /** Nội dung VHV vừa xác nhận ở hộp thoại hoàn thành, dùng làm ghi chú của dòng. */
    note?: string | null;
  }
) {
  const links = await tx.defectMaterialRequest.findMany({
    where: { defectId: params.defectId },
    select: {
      quantity: true,
      pointLabel: true,
      materialId: true,
      replacement: { select: LOG_SOURCE_SELECT },
    },
  });
  if (links.length === 0) return { logged: 0, released: 0 };

  let logged = 0;
  let released = 0;
  for (const link of links) {
    const declaration = link.replacement;
    // Điểm khai báo đã bị xoá khỏi danh mục sau khi ra phiếu — không còn đủ dữ liệu
    // vị trí để dựng snapshot, bỏ qua thay vì ghi một dòng lịch sử khuyết thông tin.
    if (!declaration) continue;

    const tracked = declaration.deviceSeq
      ? await tx.materialReplacement.findFirst({
          where: { isActive: true, materialId: declaration.materialId, deviceSeq: declaration.deviceSeq },
          select: LOG_SOURCE_SELECT,
          orderBy: { nextDueAt: "asc" },
        })
      : null;

    await tx.materialReplacementLog.create({
      data: buildReplacementLogData({
        // Giá trị snapshot lấy từ điểm theo dõi nếu có, không thì từ dòng khai báo…
        point: tracked ?? declaration,
        // …nhưng chỉ NEO vào điểm theo dõi, không bao giờ neo vào dòng khai báo.
        replacementId: tracked?.id ?? null,
        doneById: params.userId,
        replacedAt: params.replacedAt,
        quantity: link.quantity || null,
        note: params.note?.trim() || "Ghi nhận từ số yêu cầu thay thế vật tư",
        systemLabel: link.pointLabel.split(" · ")[0] || declaration.system,
        defect: params.defect ?? null,
      }),
    });
    logged += 1;

    if (tracked) {
      await tx.materialReplacement.update({
        where: { id: tracked.id },
        data: { isActive: false, lastReplacedAt: params.replacedAt },
      });
      released += 1;
    }
  }
  return { logged, released };
}

type PointReader = Pick<PrismaClient, "materialReplacement"> | Prisma.TransactionClient;

/**
 * Đọc lại các điểm khai báo từ DB và tự dựng lại toàn bộ trường định danh của phiếu.
 * Client chỉ được gửi danh sách id — tổ máy, cương vị và thiết bị KHÔNG nhận từ client
 * để phiếu luôn trỏ đúng node đã khai báo trong Danh mục vật tư.
 *
 * Trả về chuỗi lỗi tiếng Việt khi không hợp lệ.
 */
export async function resolveMaterialRequest(
  db: PointReader,
  rawIds: unknown
): Promise<ResolvedMaterialRequest | string> {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.map((value) => String(value ?? "").trim()).filter(Boolean))]
    : [];
  if (ids.length === 0) return "Vui lòng chọn ít nhất một điểm thay thế";
  if (ids.length > MAX_MATERIAL_REQUEST_POINTS) {
    return `Mỗi số yêu cầu chỉ được gộp tối đa ${MAX_MATERIAL_REQUEST_POINTS} điểm thay thế`;
  }

  const found = await db.materialReplacement.findMany({ where: { id: { in: ids } }, select: POINT_SELECT });
  if (found.length !== ids.length) return "Có điểm thay thế không còn tồn tại, vui lòng tải lại trang";

  // Giữ đúng thứ tự người dùng chọn: điểm đầu tiên quyết định thiết bị chính.
  const points = ids.map((id) => found.find((point) => point.id === id)!);

  const materialIds = new Set(points.map((point) => point.materialId));
  if (materialIds.size > 1) return "Chỉ được gộp các điểm của cùng một vật tư vào một số yêu cầu";

  const missingDevice = points.find((point) => !point.deviceSeq);
  if (missingDevice) {
    return `Điểm "${pointLabelOf(missingDevice)}" chưa gắn hệ thống/thiết bị trên cây nên không ra được số yêu cầu`;
  }

  const machines = new Set(points.map((point) => point.machine));
  if (machines.size > 1) return "Chỉ được gộp các điểm cùng tổ máy vào một số yêu cầu";

  const first = points[0];
  const positionMismatch = points.some((point) =>
    point.managingPositionCode && first.managingPositionCode
      ? point.managingPositionCode !== first.managingPositionCode
      : !positionsMatch(point.managingPosition, first.managingPosition)
  );
  if (positionMismatch) return "Chỉ được gộp các điểm cùng cương vị quản lý vào một số yêu cầu";

  const unitLabel = first.material.unit;
  return {
    points,
    unit: first.machine,
    managingPosition: first.managingPosition,
    positionCode: first.managingPositionCode ?? positionCodeOf(first.managingPosition),
    primarySeq: first.deviceSeq!,
    // Tên node đi thẳng lên cột C của Google Sheet. Với điểm khai báo ở cấp thư
    // mục, đây là tên thư mục — đúng theo nghiệp vụ SYC thay thế vật tư.
    primaryName: first.device?.name || deviceLabelOf(first) || "",
    relatedSeqs: [...new Set(points.slice(1).map((point) => point.deviceSeq!))].filter(
      (seq) => seq !== first.deviceSeq
    ),
    suggestedContent: buildMaterialRequestContent(points),
    rows: points.map((point) => ({
      replacementId: point.id,
      materialId: point.materialId,
      quantity: totalQuantityOf(point),
      unitLabel,
      pointLabel: pointLabelOf(point),
    })),
  };
}
