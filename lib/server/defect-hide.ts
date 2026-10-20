import type { Prisma } from "@prisma/client";
import { canHideMissingDefect, HIDDEN_DEFECT_SYNC_STATE } from "@/lib/defect-visibility";

// Giữ lỗi nghiệp vụ qua ranh giới transaction Prisma, rồi đổi sang Response ở route.
export class HideMissingDefectError extends Error {
  constructor(message: string, public readonly status: 403 | 404 | 409) { super(message); }
}

/** Chạy trong transaction Serializable để không ẩn giữa lúc phiếu có nguồn trở lại. */
export async function hideMissingDefect(
  tx: Prisma.TransactionClient,
  params: {
    id: string;
    updatedAt: Date;
    canEdit: (defect: { device: string | null; system: string | null }) => boolean;
  },
) {
  const existing = await tx.defect.findUnique({
    where: { id: params.id },
    include: { pendingHistory: { select: { id: true } } },
  });
  if (!existing) throw new HideMissingDefectError("Không tìm thấy phiếu khiếm khuyết", 404);
  if (!params.canEdit(existing)) throw new HideMissingDefectError("Cương vị của bạn không có quyền ẩn phiếu khiếm khuyết này", 403);
  if (!canHideMissingDefect(existing)) {
    throw new HideMissingDefectError("Chỉ được ẩn phiếu Google Sheet mất nguồn, chưa hủy và chưa lưu lịch sử", 409);
  }
  if (existing.updatedAt.getTime() !== params.updatedAt.getTime()) {
    throw new HideMissingDefectError("Phiếu vừa thay đổi; vui lòng tải lại danh sách trước khi ẩn", 409);
  }
  const queued = await tx.defectSyncOutbox.count({
    where: { defectId: existing.id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
  });
  if (queued > 0) {
    throw new HideMissingDefectError("Phiếu còn thay đổi đang chờ đồng bộ Google Sheet; hãy xử lý hàng đợi trước khi ẩn", 409);
  }
  const result = await tx.defect.updateMany({
    where: {
      id: existing.id,
      sourceType: "GOOGLE_SHEETS",
      syncState: "MISSING",
      updatedAt: params.updatedAt,
      cancelledAt: null,
      pendingHistory: { is: null },
    },
    // Không đổi trạng thái nghiệp vụ, liên kết, ảnh, lịch sử hoặc quyền tái cấp số.
    data: { syncState: HIDDEN_DEFECT_SYNC_STATE },
  });
  if (result.count !== 1) throw new HideMissingDefectError("Phiếu vừa thay đổi; vui lòng tải lại danh sách trước khi ẩn", 409);
  return existing;
}
