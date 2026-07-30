"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCompleteDefect, useUpdatePendingDefectHistory, type DefectItem } from "@/hooks/useDefects";
import { useEquipmentNode } from "@/hooks/useEquipment";
import { parseScope } from "@/lib/equipment-units";
import { DEFECT_REQUEST_TYPES, blockForPosition } from "@/lib/constants";
import { formatDate, formatDateInput } from "@/lib/utils";
import { defectResultStatusOf } from "@/lib/defect-result-status";

const NONE = "__none__";

function todayInput(): string {
  return formatDateInput();
}

export function CompleteDefectDialog({
  defect,
  onClose,
}: {
  defect: DefectItem | null;
  onClose: () => void;
}) {
  const complete = useCompleteDefect();
  const updatePending = useUpdatePendingDefectHistory();
  // Chỉ cần TÊN của đúng một thiết bị. Trước đây dùng useDevices({}) — tải toàn bộ 21.948
  // thiết bị (10 MB) mỗi lần vào trang Khiếm khuyết, vì hook chạy cả khi hộp thoại đang đóng.
  const deviceQuery = useEquipmentNode(defect?.device || null, parseScope(defect?.unit));
  const deviceName = deviceQuery.data?.data?.name ?? defect?.device ?? "—";
  const [form, setForm] = React.useState({
    workOrderNumber: "",
    requestType: "",
    performedAt: todayInput(),
    content: "",
    result: "",
  });
  const sheetTracked = defect?.sourceType === "GOOGLE_SHEETS" || defect?.websiteCreated;
  const editingPending = Boolean(defect?.pendingHistory);
  const hasSheetSourceData = defect?.sourceType === "GOOGLE_SHEETS";
  const pendingDays = defectResultStatusOf(
    editingPending ? form.result : defect?.repairResultRaw
  ) === "DA_XU_LY" ? 4 : 14;

  // Dùng dữ liệu Sửa chữa từ Sheet để điền sẵn các trường tương ứng. Đây chỉ
  // là giá trị ban đầu; Vận hành vẫn được chỉnh sửa trước khi ghi lịch sử.
  React.useEffect(() => {
    if (defect) {
      setForm({
        workOrderNumber: defect.pendingHistory?.workOrderNumber
          ?? defect.repairOrderNumberRaw?.trim()
          ?? "",
        requestType: defect.pendingHistory?.requestType ?? defect.requestType ?? "",
        performedAt: defect.pendingHistory?.performedAt
          ? formatDateInput(defect.pendingHistory.performedAt)
          : defect.sourceCompletedAt
            ? formatDateInput(defect.sourceCompletedAt)
            : todayInput(),
        content: defect.pendingHistory?.content
          ?? defect.repairPerformedContentRaw?.trim()
          ?? "",
        result: defect.pendingHistory?.result
          ?? defect.repairResultRaw?.trim()
          ?? "",
      });
    }
  }, [defect]);

  async function submit() {
    if (!defect) return;
    if (!form.performedAt) return toast.error("Vui lòng chọn ngày kết thúc");
    try {
      const payload = {
        id: defect.id,
        workOrderNumber: form.workOrderNumber,
        requestType: form.requestType,
        performedAt: form.performedAt,
        content: form.content,
        result: form.result,
      };
      if (editingPending) await updatePending.mutateAsync(payload);
      else await complete.mutateAsync(payload);
      toast.success(
        editingPending
          ? `Đã cập nhật; hạn chốt lịch sử được tính lại sau ${pendingDays} ngày`
          : sheetTracked
          ? `Đã xác nhận; phiếu sẽ được chốt lịch sử sau ${pendingDays} ngày`
          : "Đã hoàn thành & ghi lịch sử thiết bị"
      );
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!defect} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className={editingPending
              ? "h-5 w-5 text-blue-600"
              : sheetTracked
                ? "h-5 w-5 text-amber-600"
                : "h-5 w-5 text-green-600"} />
            {editingPending
              ? "Sửa thông tin lịch sử"
              : sheetTracked
                ? "Xác nhận lưu lịch sử"
                : "Hoàn thành khiếm khuyết"}
          </DialogTitle>
        </DialogHeader>

        {defect && (
          <div className="space-y-4">
            {/* Tổ máy & Cương vị — lấy từ khiếm khuyết, chỉ đọc. */}
            <div className="grid grid-cols-2 gap-3">
              <ReadOnly label="Tổ máy" value={defect.unit} />
              <ReadOnly label="Cương vị" value={defect.system ?? "—"} />
            </div>
            <ReadOnly label="Khối quản lý" value={blockForPosition(defect.system)} />
            {sheetTracked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">
                Phiếu vẫn nằm trong Tồn đọng và tiếp tục nhận dữ liệu sửa chữa từ Google Sheet trong {pendingDays} ngày.
                Sau thời hạn này hệ thống mới chốt bản đầy đủ vào lịch sử.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Số PCT/LCT">
                {hasSheetSourceData && defect.repairOrderNumberRaw?.trim() && (
                  <SourceValue value={defect.repairOrderNumberRaw.trim()} />
                )}
                <Input
                  value={form.workOrderNumber}
                  onChange={(e) => setForm((f) => ({ ...f, workOrderNumber: e.target.value }))}
                  placeholder="Nhập số PCT/LCT của Vận hành"
                />
              </Field>
              <Field label="Loại yêu cầu">
                <Select
                  value={form.requestType || NONE}
                  onValueChange={(v) => setForm((f) => ({ ...f, requestType: v === NONE ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn loại yêu cầu" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Không chọn —</SelectItem>
                    {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {/* Tên thiết bị — đồng bộ từ danh mục thiết bị theo mã thiết bị của khiếm khuyết. */}
            <ReadOnly label="Tên thiết bị" value={deviceName} />
            <Field label="Ngày kết thúc *">
              {hasSheetSourceData && defect.sourceCompletedAt && (
                <SourceValue value={formatDate(defect.sourceCompletedAt)} />
              )}
              <Input
                type="date"
                value={form.performedAt}
                onChange={(e) => setForm((f) => ({ ...f, performedAt: e.target.value }))}
              />
            </Field>
            <Field label="Nội dung thực hiện">
              {hasSheetSourceData && defect.repairPerformedContentRaw?.trim() && (
                <SourceValue value={defect.repairPerformedContentRaw.trim()} multiline />
              )}
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={3}
                placeholder="Vận hành nhập nội dung thực hiện để ghi vào lịch sử…"
              />
            </Field>
            <Field label="Kết quả thực hiện">
              {hasSheetSourceData && defect.repairResultRaw?.trim() && (
                <SourceValue value={defect.repairResultRaw.trim()} multiline />
              )}
              <Textarea
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
                rows={3}
                placeholder="Vận hành nhập kết quả thực hiện để ghi vào lịch sử…"
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button
            onClick={submit}
            disabled={complete.isPending || updatePending.isPending}
            className={editingPending
              ? "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500"
              : sheetTracked
                ? "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500"
                : "bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500"}
          >
            {(complete.isPending || updatePending.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            {editingPending
              ? "Lưu và tính lại hạn chốt"
              : sheetTracked
                ? "Xác nhận lưu lịch sử"
                : "Hoàn thành"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}

function SourceValue({ value, multiline = false }: { value: string; multiline?: boolean }) {
  return (
    <div className="mb-2 rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Thông tin Sửa chữa từ Google Sheet · chỉ tham khảo</div>
      <div className={multiline ? "mt-1 whitespace-pre-wrap text-sm text-ink" : "mt-0.5 text-sm font-medium text-ink"}>
        {value}
      </div>
    </div>
  );
}
