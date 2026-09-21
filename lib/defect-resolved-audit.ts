import type { Prisma } from "@prisma/client";
import { auditDetailWithPosition } from "@/lib/api";
import { DEFECT_STATUS, type DefectStatusKey } from "@/lib/constants";
import { DEFECT_RESOLVED_AUDIT_ACTION, defectAuditReference } from "@/lib/defect-audit";

/**
 * Ghi khi website chuyển phiếu từ trạng thái khác sang Đã xử lý. Chỉ ghi khi trạng thái
 * thật sự đổi: VHV xác nhận lưu lịch sử phiếu đã ở Đã xử lý sẵn không được tính.
 */
export function auditDefectResolved(
  tx: Prisma.TransactionClient,
  user: { id: string; currentPosition?: string | null; position?: string | null },
  defect: { id: string; requestType?: string | null; requestNumber?: string | null },
  previousStatus: string
) {
  if (previousStatus === "DA_XU_LY") return Promise.resolve();
  const previousLabel = DEFECT_STATUS[previousStatus as DefectStatusKey]?.label ?? previousStatus;
  return tx.auditLog.create({
    data: {
      userId: user.id,
      action: DEFECT_RESOLVED_AUDIT_ACTION,
      entity: "Defect",
      entityId: defect.id,
      detail: auditDetailWithPosition(
        user,
        `${defectAuditReference("Chuyển sang Đã xử lý", defect)} · Trạng thái trước: ${previousLabel}`
      ),
    },
  });
}
