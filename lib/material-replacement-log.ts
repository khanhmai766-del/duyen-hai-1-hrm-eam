import type { Prisma } from "@prisma/client";

/**
 * Dựng dữ liệu cho MỘT dòng lịch sử thay thế.
 *
 * Lịch sử phải bất biến, còn điểm thay thế thì không: nó bị gỡ sau mỗi lần ghi nhận
 * và có thể bị xoá hẳn khi khai báo lại danh mục. Vì vậy mọi thứ cần để hiển thị đều
 * được sao chép thành snapshot ngay tại đây; `replacementId` chỉ là liên kết mềm
 * (SetNull) dùng để truy vết khi điểm vẫn còn.
 *
 * Dùng chung cho cả hai cửa ghi nhận — thủ công ở Lịch thay thế, và tự động khi
 * hoàn thành SYC thay thế vật tư — để lịch sử chỉ có một dạng dòng duy nhất.
 */
export type ReplacementLogSource = {
  id: string;
  materialId: string;
  deviceSeq: string | null;
  machine: string;
  system: string | null;
  location: string | null;
  managingPosition: string | null;
  intervalMonths: number;
  intervalNote: string | null;
  material: { unit: string };
  device?: { name: string; parentSeq?: string | null } | null;
};

export function buildReplacementLogData(params: {
  /** Nguồn lấy giá trị snapshot — điểm theo dõi hoặc dòng khai báo. */
  point: ReplacementLogSource;
  /**
   * Điểm được neo vào. CHỈ truyền id của ĐIỂM THEO DÕI (isActive=true).
   *
   * Tuyệt đối không neo vào dòng khai báo: bảng "Chi tiết điểm thay thế" lọc theo
   * `_count.logs === 0`, neo vào đó là dòng khai báo biến mất khỏi danh mục. Không
   * có điểm theo dõi thì để null — snapshot đã đủ để hiển thị lịch sử.
   */
  replacementId: string | null;
  doneById: string;
  replacedAt: Date;
  quantity?: number | null;
  note?: string | null;
  /** Tên hệ thống hiển thị; mặc định lấy `system` của điểm. */
  systemLabel?: string | null;
  /** Nguồn gốc khi ghi nhận sinh ra từ một số yêu cầu thay thế vật tư. */
  defect?: { id: string; requestNumber: string | null } | null;
}): Prisma.MaterialReplacementLogUncheckedCreateInput {
  const { point } = params;
  return {
    replacementId: params.replacementId,
    doneById: params.doneById,
    replacedAt: params.replacedAt,
    quantity: params.quantity ?? null,
    note: params.note?.trim() || null,

    materialId: point.materialId,
    deviceSeq: point.deviceSeq,
    machine: point.machine,
    systemLabel: params.systemLabel ?? point.system ?? null,
    deviceLabel: point.device?.name ?? point.location ?? null,
    managingPosition: point.managingPosition,
    intervalMonths: point.intervalMonths,
    intervalNote: point.intervalNote,
    unitLabel: point.material.unit,

    defectId: params.defect?.id ?? null,
    requestNumber: params.defect?.requestNumber ?? null,
  };
}

/** Trường snapshot cần đọc để dựng lại dòng lịch sử khi điểm đã bị gỡ. */
export const REPLACEMENT_LOG_SNAPSHOT_SELECT = {
  materialId: true,
  deviceSeq: true,
  machine: true,
  systemLabel: true,
  deviceLabel: true,
  managingPosition: true,
  intervalMonths: true,
  intervalNote: true,
  unitLabel: true,
  defectId: true,
  requestNumber: true,
} as const;
