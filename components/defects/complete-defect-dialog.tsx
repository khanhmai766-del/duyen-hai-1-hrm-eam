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
import { useCompleteDefect, type DefectItem } from "@/hooks/useDefects";
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
  const hasSheetSourceData = defect?.sourceType === "GOOGLE_SHEETS";
  // Thao tác xác nhận này sẽ đưa KQ Vận hành về "Đã xử lý", vì vậy chỉ cần
  // đối chiếu KQ Sửa chữa để hiển thị đúng hạn mà backend sắp tạo.
  const pendingDays = defectResultStatusOf(defect?.repairResultRaw) === "DA_XU_LY" ? 2 : 14;

  // Reset mỗi khi mở cho một khiếm khuyết khác. PCT mặc định = "Yêu Cầu" của khiếm khuyết.
  React.useEffect(() => {
    if (defect) {
      const hasSourceData = defect.sourceType === "GOOGLE_SHEETS";
      setForm({
        workOrderNumber: "",
        requestType: defect.requestType ?? "",
        performedAt: hasSourceData && defect.sourceCompletedAt
          ? formatDateInput(defect.sourceCompletedAt)
          : todayInput(),
        content: hasSourceData
          ? defect.repeatedRepairRaw?.trim() || defect.content || ""
          : "",
        result: hasSourceData
          ? defect.repairResultRaw?.trim() || defect.note?.trim() || defect.sourceStatusRaw?.trim() || ""
          : "",
      });
    }
  }, [defect]);

  async function submit() {
    if (!defect) return;
    if (!form.performedAt) return toast.error("Vui lòng chọn ngày kết thúc");
    try {
      await complete.mutateAsync({
        id: defect.id,
        workOrderNumber: form.workOrderNumber,
        requestType: form.requestType,
        performedAt: form.performedAt,
        content: form.content,
        result: form.result,
      });
      toast.success(
        sheetTracked
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
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {sheetTracked ? "Xác nhận đưa vào lịch sử" : "Hoàn thành khiếm khuyết"}
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
              <Field label="Số phiếu công tác">
                <Input
                  value={form.workOrderNumber}
                  onChange={(e) => setForm((f) => ({ ...f, workOrderNumber: e.target.value }))}
                  placeholder="VD: PCT-2026-001"
                  disabled={sheetTracked}
                />
              </Field>
              <Field label="PCT">
                {hasSheetSourceData && defect.requestType && (
                  <SourceValue value={defect.requestType} />
                )}
                <Select
                  value={form.requestType || NONE}
                  disabled={sheetTracked}
                  onValueChange={(v) => setForm((f) => ({ ...f, requestType: v === NONE ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn PCT" /></SelectTrigger>
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
              {hasSheetSourceData && (defect.repeatedRepairRaw || defect.content) && (
                <SourceValue value={defect.repeatedRepairRaw || defect.content || ""} multiline />
              )}
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={3}
                placeholder="Mô tả nội dung công việc thực hiện…"
                disabled={sheetTracked}
              />
            </Field>
            <Field label="Kết quả thực hiện">
              {hasSheetSourceData && (defect.repairResultRaw || defect.note || defect.sourceStatusRaw) && (
                <SourceValue value={defect.repairResultRaw || defect.note || defect.sourceStatusRaw || ""} multiline />
              )}
              <Textarea
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
                rows={3}
                placeholder="Mô tả kết quả xử lý…"
                disabled={sheetTracked}
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={complete.isPending}>
            {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {sheetTracked ? "Xác nhận" : "Hoàn thành"}
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
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Dữ liệu có sẵn từ Google Sheet</div>
      <div className={multiline ? "mt-1 whitespace-pre-wrap text-sm text-ink" : "mt-0.5 text-sm font-medium text-ink"}>
        {value}
      </div>
    </div>
  );
}
