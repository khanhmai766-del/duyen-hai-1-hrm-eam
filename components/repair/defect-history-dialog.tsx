"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import { useCreateDefectHistory, useUpdateDefectHistory, type DefectHistoryItem } from "@/hooks/useDefectHistory";
import { usePositions } from "@/hooks/useUsers";
import { useDevices } from "@/hooks/useDevices";
import { DEFECT_UNITS, DEFECT_REQUEST_TYPES } from "@/lib/constants";

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}
function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const NONE = "__none__";
const EMPTY = { unit: "", device: "", system: "", requestType: "", workOrderNumber: "", performedAt: todayInput(), result: "", images: [] as string[] };

/**
 * Hộp thoại Thêm mới / Chỉnh sửa một bản ghi lịch sử khiếm khuyết.
 * Truyền `record` để vào chế độ sửa; bỏ trống để tạo mới.
 */
export function DefectHistoryDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record?: DefectHistoryItem | null;
}) {
  const isEdit = !!record;
  const create = useCreateDefectHistory();
  const update = useUpdateDefectHistory();
  const positions = usePositions();
  // Thiết bị — dùng chung danh mục với form khiếm khuyết.
  const { data: devicesData } = useDevices({});
  const devices = devicesData?.data ?? [];
  const [form, setForm] = React.useState({ ...EMPTY });

  React.useEffect(() => {
    if (!open) return;
    setForm(
      record
        ? {
            unit: record.unit ?? "",
            device: record.device ?? "",
            system: record.system ?? "",
            requestType: record.requestType ?? "",
            workOrderNumber: record.workOrderNumber ?? "",
            performedAt: toDateInput(record.performedAt),
            result: record.result ?? "",
            images: record.images ?? [],
          }
        : { ...EMPTY }
    );
  }, [open, record]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!form.unit) return toast.error("Vui lòng chọn tổ máy");
    if (!form.performedAt) return toast.error("Vui lòng chọn ngày thực hiện");
    try {
      if (isEdit) await update.mutateAsync({ id: record!.id, ...form });
      else await create.mutateAsync(form);
      toast.success(isEdit ? "Đã cập nhật bản ghi lịch sử" : "Đã thêm bản ghi lịch sử");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="h-5 w-5 text-accent" /> : <Plus className="h-5 w-5 text-accent" />}
            {isEdit ? "Chỉnh sửa lịch sử" : "Thêm mới lịch sử"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tổ máy *">
              <div className="grid grid-cols-2 gap-2">
                {DEFECT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => set("unit", u)}
                    className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                      form.unit === u ? "border-navy bg-navy text-white" : "border-input bg-muted/40 text-ink hover:border-accent"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Cương vị">
              <Select value={form.system || NONE} onValueChange={(v) => set("system", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {/* Đảm bảo giá trị hiện tại luôn hiện, kể cả khi chức vụ đã bị đổi tên/xoá. */}
                  {(form.system && !positions.includes(form.system) ? [form.system, ...positions] : positions).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Số phiếu công tác">
              <Input value={form.workOrderNumber} onChange={(e) => set("workOrderNumber", e.target.value)} placeholder="VD: PCT-2026-001" />
            </Field>
            <Field label="PCT">
              <Select value={form.requestType || NONE} onValueChange={(v) => set("requestType", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn PCT" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Thiết bị">
            <Select value={form.device || NONE} onValueChange={(v) => set("device", v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Không chọn —</SelectItem>
                {devices.map((d) => <SelectItem key={d.id} value={d.code}>{d.code} — {d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ngày thực hiện *">
            <Input type="date" value={form.performedAt} onChange={(e) => set("performedAt", e.target.value)} />
          </Field>
          <Field label="Kết quả thực hiện">
            <Textarea value={form.result} onChange={(e) => set("result", e.target.value)} rows={3} placeholder="Mô tả kết quả xử lý…" />
          </Field>
          <Field label="Hình ảnh (tối đa 3)">
            <MultiImagePicker value={form.images} onChange={(v) => set("images", v)} max={3} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {isEdit ? "Lưu" : "Thêm mới"}
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
