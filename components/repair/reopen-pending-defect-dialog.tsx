"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReopenPendingDefect } from "@/hooks/useDefectHistory";
import { DEFECT_STATUS, DEFECT_STATUS_ORDER, type DefectStatusKey } from "@/lib/constants";

const REOPEN_STATUSES = DEFECT_STATUS_ORDER.filter((status) => status !== "DA_XU_LY");

export interface ReopenPendingDefectTarget {
  id: string;
  requestNumber: string | null;
}

export function ReopenPendingDefectDialog({
  target,
  onClose,
}: {
  target: ReopenPendingDefectTarget;
  onClose: () => void;
}) {
  const [status, setStatus] = React.useState<DefectStatusKey>("CHUA_XU_LY");
  const reopen = useReopenPendingDefect();
  const reference = target.requestNumber || "phiếu này";

  async function handleConfirm() {
    try {
      const result = await reopen.mutateAsync({ id: target.id, status });
      toast.success(`Đã đưa ${reference} trở lại Tồn đọng`, {
        description: result.syncQueued
          ? `${DEFECT_STATUS[status].label} · Đã thêm vào hàng đợi cập nhật Google Sheet.`
          : `${DEFECT_STATUS[status].label} · Chưa tạo được tác vụ cập nhật Google Sheet.`,
      });
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !reopen.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <RotateCcw className="h-5 w-5" />
          </div>
          <DialogTitle>Rút xác nhận chờ chốt?</DialogTitle>
          <DialogDescription>
            {reference} sẽ rời trang Lịch sử và xuất hiện lại trong danh sách Khiếm khuyết.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-ink" htmlFor="reopen-status">
            Trạng thái đưa về
          </label>
          <Select value={status} onValueChange={(value) => setStatus(value as DefectStatusKey)} disabled={reopen.isPending}>
            <SelectTrigger id="reopen-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REOPEN_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>{DEFECT_STATUS[value].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Trạng thái mới sẽ được đưa vào hàng đợi ghi ngược Google Sheet. Nếu đây là yêu cầu thay vật tư,
            hệ thống cũng hoàn tác lần thay chưa chốt khi dữ liệu còn đủ điều kiện.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={reopen.isPending}>Giữ chờ chốt</Button>
          <Button onClick={handleConfirm} disabled={reopen.isPending} className="bg-amber-600 hover:bg-amber-700">
            {reopen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Rút xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
