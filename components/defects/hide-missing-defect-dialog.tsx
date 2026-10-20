"use client";

import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useHideMissingDefect, type DefectItem } from "@/hooks/useDefects";

export function HideMissingDefectDialog({ defect, onClose }: { defect: DefectItem | null; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  const hide = useHideMissingDefect();
  return (
    <ConfirmDialog
      open={!!defect}
      onOpenChange={(open) => { if (!open && !hide.isPending) onClose(); }}
      title="Ẩn phiếu mất nguồn?"
      description={`Phiếu ${defect?.requestNumber || ""} (${defect?.requestType || "chưa phân loại"}) sẽ được bỏ khỏi danh sách Khiếm khuyết và số liệu tồn đọng.`}
      confirmLabel="Ẩn phiếu"
      destructive={false}
      loading={hide.isPending}
      confirmDisabled={reason.trim().length < 5}
      onConfirm={async () => {
        if (!defect) return;
        try {
          const updatedAt = new Date(defect.updatedAt);
          if (!Number.isFinite(updatedAt.getTime())) {
            throw new Error("Không đọc được phiên bản phiếu; vui lòng tải lại danh sách rồi thử lại");
          }
          await hide.mutateAsync({ id: defect.id, reason: reason.trim(), updatedAt: updatedAt.toISOString() });
          toast.success("Đã ẩn phiếu mất nguồn");
          onClose();
        } catch (error) { toast.error((error as Error).message); }
      }}
    >
      <p className="rounded-lg bg-sky-50 px-3 py-2.5 text-sm leading-6 text-sky-950">
        Chỉ ẩn trên website. Bản ghi, liên kết và lịch sử vẫn được giữ; không ghi lên Google Sheet, không hủy hoặc trả số phiếu.
      </p>
      <div className="space-y-2">
        <label htmlFor="hide-missing-reason" className="text-sm font-medium">Lý do ẩn <span className="text-destructive">*</span></label>
        <Textarea id="hide-missing-reason" value={reason} onChange={(event) => setReason(event.target.value)}
          rows={3} maxLength={1000} className="text-base sm:text-sm" disabled={hide.isPending}
          placeholder="Nhập lý do ẩn phiếu (ít nhất 5 ký tự)…" />
      </div>
    </ConfirmDialog>
  );
}
