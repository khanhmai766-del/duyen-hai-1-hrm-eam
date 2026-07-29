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

  // Đây là nội dung Vận hành ghi vào lịch sử. Dữ liệu Sửa chữa từ Sheet chỉ
  // hiển thị để đối chiếu, không tự điền hoặc khóa các trường này.
  React.useEffect(() => {
    if (defect) {
      setForm({
        workOrderNumber: "",
        requestType: defect.requestType ?? "",
        performedAt: todayInput(),
        content: "",
        result: "",
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
              {hasSheetSourceData && (defect.repairResultRaw || defect.note || defect.sourceStatusRaw) && (
                <SourceValue value={defect.repairResultRaw || defect.note || defect.sourceStatusRaw || ""} multiline />
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
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Thông tin Sửa chữa từ Google Sheet · chỉ tham khảo</div>
      <div className={multiline ? "mt-1 whitespace-pre-wrap text-sm text-ink" : "mt-0.5 text-sm font-medium text-ink"}>
        {value}
      </div>
    </div>
  );
}
