"use client";

import * as React from "react";
import { toast } from "sonner";
import { CompleteDefectDialog } from "@/components/defects/complete-defect-dialog";
import { useDefect } from "@/hooks/useDefects";

/**
 * Hộp thoại sửa thông tin bản nháp chờ chốt. Bảng lịch sử chỉ giữ id của phiếu
 * khiếm khuyết nên phải tải chi tiết phiếu rồi mới mở được đúng hộp thoại cũ.
 *
 * Dùng chung cho HAI bảng lịch sử: Lịch sử sửa chữa (khiếm khuyết thường) và
 * Lịch sử thay thế (SYC thay thế vật tư — không còn hiện ở bảng kia nữa, nên nếu
 * thiếu nút này thì trong suốt thời gian chờ chốt sẽ không còn đường nào sửa
 * nội dung/PCT/kết quả).
 */
export function PendingHistoryEditDialog({ defectId, onClose }: { defectId: string; onClose: () => void }) {
  const detail = useDefect(defectId);
  const defect = detail.data?.data ?? null;

  React.useEffect(() => {
    if (detail.isError) {
      toast.error("Không tải được phiếu khiếm khuyết của bản ghi này");
      onClose();
    }
  }, [detail.isError, onClose]);

  if (!defect) return null;
  return <CompleteDefectDialog defect={defect} onClose={onClose} />;
}
