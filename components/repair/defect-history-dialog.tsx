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
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import { useCreateDefectHistory, useUpdateDefectHistory, type DefectHistoryItem } from "@/hooks/useDefectHistory";
import { usePositions } from "@/hooks/useUsers";
import { DEFECT_UNITS, DEFECT_REQUEST_TYPES, blockForPosition, isSelectableManagingPosition } from "@/lib/constants";
import { formatDateInput } from "@/lib/utils";
import { positionsMatch } from "@/lib/position-catalog";
import type { TreeScope } from "@/lib/equipment-units";

function todayInput(): string {
  return formatDateInput();
}
function toDateInput(v: Date | string | null | undefined): string {
  return formatDateInput(v);
}

const NONE = "__none__";
const EMPTY = { unit: "", device: "", mappedDeviceUnit: "", system: "", requestType: "", workOrderNumber: "", performedAt: todayInput(), defectContent: "", content: "", result: "" };

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
  // Cương vị chọn được — loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên.
  const positions = usePositions().filter(isSelectableManagingPosition);
  const [form, setForm] = React.useState({ ...EMPTY });

  React.useEffect(() => {
    if (!open) return;
    setForm(
      record
        ? {
            unit: record.unit ?? "",
            device: record.deviceSeq ?? record.device ?? "",
            mappedDeviceUnit: record.mappedDeviceUnit ?? record.unit ?? "",
            system: record.system ?? "",
            requestType: record.requestType ?? "",
            workOrderNumber: record.workOrderNumber ?? "",
            performedAt: toDateInput(record.performedAt),
            defectContent: record.defectContent ?? "",
            content: record.content ?? "",
            result: record.result ?? "",
          }
        : { ...EMPTY }
    );
  }, [open, record]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setSystem(v: string) {
    setForm((f) => {
      const system = v === NONE ? "" : v;
      return {
        ...f,
        system,
        // Cây được lọc theo cương vị. Khi đổi cương vị, bỏ node cũ để không giữ
        // một thiết bị/thư mục nằm ngoài phạm vi mới.
        device: system === f.system ? f.device : "",
      };
    });
  }

  function setUnit(unit: string) {
    setForm((current) => ({
      ...current,
      unit,
      mappedDeviceUnit: unit,
      // S1/S2/COMMON là ba hình chiếu cây khác nhau; không giữ node của cây cũ.
      device: unit === current.unit ? current.device : "",
    }));
  }

  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!form.unit) return toast.error("Vui lòng chọn tổ máy");
    if (!form.performedAt) return toast.error("Vui lòng chọn ngày kết thúc");
    try {
      if (isEdit) {
        await update.mutateAsync({ id: record!.id, ...form });
      }
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
              <div className="grid grid-cols-3 gap-2">
                {DEFECT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
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
              <Select value={form.system || NONE} onValueChange={setSystem}>
                <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {/* Đảm bảo giá trị hiện tại luôn hiện, kể cả khi chức vụ đã bị đổi tên/xoá. */}
                  {(form.system && !positions.some((position) => positionsMatch(position, form.system)) ? [form.system, ...positions] : positions).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Khối quản lý">
            <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-ink">
              {blockForPosition(form.system)}
            </div>
          </Field>

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
            <EquipmentTreePicker
              value={form.device}
              onChange={(node) => set("device", node?.seq ?? "")}
              position={form.system || null}
              accessFilter="edit"
              includeLeaves
              leafOnly={false}
              scope={(form.mappedDeviceUnit || form.unit || "S1") as TreeScope}
              placeholder={form.unit ? "Chọn thư mục hoặc thiết bị" : "Chọn tổ máy trước"}
              disabled={!form.unit}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Mở cây tới đâu tải tới đó; có thể chọn thư mục hoặc thiết bị cấp cuối.
            </p>
          </Field>
          <Field label="Ngày kết thúc *">
            <Input type="date" value={form.performedAt} onChange={(e) => set("performedAt", e.target.value)} />
          </Field>
          <Field label="Nội dung công tác">
            <Textarea value={form.defectContent} onChange={(e) => set("defectContent", e.target.value)} rows={3} placeholder="Nội dung của khiếm khuyết thiết bị…" />
          </Field>
          <Field label="Nội dung thực hiện">
            <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={3} placeholder="Mô tả nội dung công việc thực hiện…" />
          </Field>
          <Field label="Kết quả thực hiện">
            <Textarea value={form.result} onChange={(e) => set("result", e.target.value)} rows={3} placeholder="Mô tả kết quả xử lý…" />
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
