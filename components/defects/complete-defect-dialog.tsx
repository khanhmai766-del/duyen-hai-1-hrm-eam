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
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import { useCompleteDefect, type DefectItem } from "@/hooks/useDefects";
import { DEFECT_REQUEST_TYPES, blockForPosition } from "@/lib/constants";

const NONE = "__none__";

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CompleteDefectDialog({
  defect,
  onClose,
}: {
  defect: DefectItem | null;
  onClose: () => void;
}) {
  const complete = useCompleteDefect();
  const [form, setForm] = React.useState({
    workOrderNumber: "",
    requestType: "",
    performedAt: todayInput(),
    result: "",
    images: [] as string[],
  });

  // Reset mỗi khi mở cho một khiếm khuyết khác. PCT mặc định = "Yêu Cầu" của khiếm khuyết.
  React.useEffect(() => {
    if (defect) setForm({ workOrderNumber: "", requestType: defect.requestType ?? "", performedAt: todayInput(), result: "", images: [] });
  }, [defect]);

  async function submit() {
    if (!defect) return;
    if (!form.performedAt) return toast.error("Vui lòng chọn ngày thực hiện");
    try {
      await complete.mutateAsync({
        id: defect.id,
        workOrderNumber: form.workOrderNumber,
        requestType: form.requestType,
        performedAt: form.performedAt,
        result: form.result,
        images: form.images,
      });
      toast.success("Đã hoàn thành & ghi lịch sử thiết bị");
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
            <CheckCircle2 className="h-5 w-5 text-green-600" /> Hoàn thành khiếm khuyết
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Số phiếu công tác">
                <Input
                  value={form.workOrderNumber}
                  onChange={(e) => setForm((f) => ({ ...f, workOrderNumber: e.target.value }))}
                  placeholder="VD: PCT-2026-001"
                />
              </Field>
              <Field label="PCT">
                <Select value={form.requestType || NONE} onValueChange={(v) => setForm((f) => ({ ...f, requestType: v === NONE ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Chọn PCT" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Không chọn —</SelectItem>
                    {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {/* Thiết bị — chỉ đọc, lấy theo khiếm khuyết đang chọn (như Tổ máy/Cương vị). */}
            <ReadOnly label="Thiết bị" value={defect.device || "—"} />
            <Field label="Ngày thực hiện *">
              <Input
                type="date"
                value={form.performedAt}
                onChange={(e) => setForm((f) => ({ ...f, performedAt: e.target.value }))}
              />
            </Field>
            <Field label="Kết quả thực hiện">
              <Textarea
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
                rows={3}
                placeholder="Mô tả kết quả xử lý…"
              />
            </Field>
            <Field label="Hình ảnh (tối đa 3)">
              <MultiImagePicker value={form.images} onChange={(v) => setForm((f) => ({ ...f, images: v }))} max={3} />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={complete.isPending}>
            {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Hoàn thành
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
