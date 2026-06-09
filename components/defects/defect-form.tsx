"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, ChevronRight, ChevronLeft, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDefect, useUpdateDefect, type DefectItem } from "@/hooks/useDefects";
import {
  DEFECT_UNITS,
  DEFECT_POSITIONS,
  DEFECT_SEVERITY,
  DEFECT_SEVERITY_ORDER,
  DEFECT_CONDITION,
  DEFECT_CONDITION_ORDER,
  DEFECT_REQUEST_TYPES,
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const NONE = "__none__";

export function DefectForm({
  defect,
  onDone,
  onCancel,
}: {
  defect?: DefectItem | null;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!defect;
  const create = useCreateDefect();
  const update = useUpdateDefect();
  const [step, setStep] = React.useState<1 | 2>(1);

  const [form, setForm] = React.useState({
    unit: defect?.unit ?? "",
    system: defect?.system ?? "",
    severity: defect?.severity ?? "",
    condition: defect?.condition ?? "",
    requestType: defect?.requestType ?? "Cơ",
    requestNumber: defect?.requestNumber ?? "",
    content: defect?.content ?? "",
    status: defect?.status ?? "CHUA_XU_LY",
    detectedAt: toDateInput(defect?.detectedAt),
    note: defect?.note ?? "",
    imageUrl: defect?.imageUrl ?? "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function goNext() {
    if (!form.unit) return toast.error("Vui lòng chọn tổ máy");
    setStep(2);
  }

  async function submit() {
    if (!form.unit) { setStep(1); return toast.error("Vui lòng chọn tổ máy"); }
    const payload = { ...form, detectedAt: form.detectedAt || null };
    try {
      if (isEdit) await update.mutateAsync({ id: defect!.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(isEdit ? "Đã cập nhật khiếm khuyết" : "Đã lưu khiếm khuyết");
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex justify-center gap-6 border-b border-border">
        <TabBtn active={step === 1} onClick={() => setStep(1)} label="Thông tin chung" />
        <TabBtn active={step === 2} onClick={() => setStep(2)} label="Thông tin khiếm khuyết" />
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {step === 1 ? (
          <div className="mx-auto max-w-xl space-y-5">
            <Row label="Tổ Máy">
              <div className="grid grid-cols-2 gap-2">
                {DEFECT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => set("unit", u)}
                    className={cn(
                      "h-10 rounded-md border text-sm font-medium transition-colors",
                      form.unit === u ? "border-navy bg-navy text-white" : "border-input bg-muted/40 text-ink hover:border-accent"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Cương Vị">
              <Select value={form.system || NONE} onValueChange={(v) => set("system", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_POSITIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Mức Độ">
              <Select value={form.severity || NONE} onValueChange={(v) => set("severity", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn mức độ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_SEVERITY_ORDER.map((s) => <SelectItem key={s} value={s}>{DEFECT_SEVERITY[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Điều Kiện Thực Hiện">
              <Select value={form.condition || NONE} onValueChange={(v) => set("condition", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn điều kiện" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_CONDITION_ORDER.map((c) => <SelectItem key={c} value={c}>{DEFECT_CONDITION[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
          </div>
        ) : (
          <div className="mx-auto max-w-xl space-y-5">
            <Row label="Yêu Cầu">
              <Select value={form.requestType} onValueChange={(v) => set("requestType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Số Yêu Cầu">
              <Input value={form.requestNumber} onChange={(e) => set("requestNumber", e.target.value)} />
            </Row>
            <Row label="Nội Dung">
              <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={2} />
            </Row>
            <Row label="Tình Trạng Khiếm Khuyết">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFECT_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{DEFECT_STATUS[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Ngày Phát Hiện">
              <Input type="date" value={form.detectedAt} onChange={(e) => set("detectedAt", e.target.value)} />
            </Row>
            <Row label="Ghi Chú">
              <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} />
            </Row>
            <Row label="Hình Ảnh">
              <DefectImageField value={form.imageUrl || null} onChange={(url) => set("imageUrl", url ?? "")} />
            </Row>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border p-4">
        {step === 2 && (
          <Button type="button" variant="outline" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => onCancel?.()}>Hủy bỏ</Button>
        {step === 1 ? (
          <Button type="button" onClick={goNext}>
            Kế tiếp <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-4">
      <Label className="whitespace-nowrap text-right text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function DefectImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/defects/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Tải ảnh thất bại");
      onChange(json.data.url as string);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Ảnh khiếm khuyết" className="h-28 w-full max-w-[220px] rounded-md border border-border object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-destructive shadow ring-1 ring-border" aria-label="Gỡ ảnh">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-28 w-full items-center justify-center rounded-md border border-input bg-muted/30 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
        </button>
      )}
    </div>
  );
}
