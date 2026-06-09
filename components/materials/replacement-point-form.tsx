"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDevices } from "@/hooks/useDevices";
import { useCreateReplacement, useUpdateReplacement, type ReplacementItem } from "@/hooks/useReplacements";
import { addMonths } from "@/lib/constants";

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

type TargetMode = "DEVICE" | "LOCATION";

export function ReplacementPointForm({
  materialId,
  point,
  onDone,
}: {
  materialId: string;
  point?: ReplacementItem | null;
  onDone?: () => void;
}) {
  const isEdit = !!point;
  const create = useCreateReplacement();
  const update = useUpdateReplacement();
  const { data: devicesData } = useDevices({});
  const devices = devicesData?.data ?? [];

  const [mode, setMode] = React.useState<TargetMode>(point?.deviceId ? "DEVICE" : "LOCATION");
  const [form, setForm] = React.useState({
    deviceId: point?.deviceId ?? "",
    location: point?.location ?? "",
    intervalMonths: String(point?.intervalMonths ?? 6),
    intervalNote: point?.intervalNote ?? "",
    lastReplacedAt: toDateInput(point?.lastReplacedAt),
    nextDueAt: toDateInput(point?.nextDueAt),
    note: point?.note ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Gợi ý ngày đến hạn = (lần thay gần nhất hoặc hôm nay) + chu kỳ, khi đổi chu kỳ/lần thay.
  function recompute(next: typeof form) {
    const base = next.lastReplacedAt ? new Date(next.lastReplacedAt) : new Date();
    const months = Number(next.intervalMonths) || 0;
    return months > 0 ? toDateInput(addMonths(base, months)) : next.nextDueAt;
  }
  function onIntervalChange(v: string) {
    setForm((f) => {
      const next = { ...f, intervalMonths: v };
      return { ...next, nextDueAt: recompute(next) };
    });
  }
  function onLastChange(v: string) {
    setForm((f) => {
      const next = { ...f, lastReplacedAt: v };
      return { ...next, nextDueAt: recompute(next) };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "DEVICE" && !form.deviceId) return toast.error("Vui lòng chọn thiết bị");
    if (mode === "LOCATION" && !form.location.trim()) return toast.error("Vui lòng nhập vị trí thay thế");
    if (!form.nextDueAt) return toast.error("Vui lòng nhập ngày đến hạn");

    const payload = {
      materialId,
      deviceId: mode === "DEVICE" ? form.deviceId : null,
      location: mode === "LOCATION" ? form.location : null,
      intervalMonths: Number(form.intervalMonths),
      intervalNote: form.intervalNote,
      lastReplacedAt: form.lastReplacedAt || null,
      nextDueAt: form.nextDueAt,
      note: form.note,
    };
    try {
      if (isEdit) await update.mutateAsync({ id: point!.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(isEdit ? "Đã cập nhật điểm thay thế" : "Đã thêm điểm thay thế");
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Target: device or free-text location */}
      <div className="sm:col-span-2">
        <Label className="mb-1.5 block">Áp dụng cho *</Label>
        <div className="mb-2 inline-flex rounded-lg border border-border p-0.5 text-sm">
          <button type="button" onClick={() => setMode("DEVICE")}
            className={mode === "DEVICE" ? "rounded-md bg-navy px-3 py-1 text-white" : "px-3 py-1 text-muted-foreground"}>
            Thiết bị
          </button>
          <button type="button" onClick={() => setMode("LOCATION")}
            className={mode === "LOCATION" ? "rounded-md bg-navy px-3 py-1 text-white" : "px-3 py-1 text-muted-foreground"}>
            Vị trí tự do
          </button>
        </div>
        {mode === "DEVICE" ? (
          <Select value={form.deviceId} onValueChange={(v) => set("deviceId", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
            <SelectContent>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="VD: Trạm dầu ĐCC Máy Nghiền" />
        )}
      </div>

      <Field label="Chu kỳ thay thế (tháng) *">
        <Input type="number" min={1} value={form.intervalMonths} onChange={(e) => onIntervalChange(e.target.value)} />
      </Field>
      <Field label="Ghi chú chu kỳ">
        <Input value={form.intervalNote} onChange={(e) => set("intervalNote", e.target.value)} placeholder="VD: 2500h" />
      </Field>

      <Field label="Lần thay gần nhất">
        <Input type="date" value={form.lastReplacedAt} onChange={(e) => onLastChange(e.target.value)} />
      </Field>
      <Field label="Đến hạn kế tiếp *">
        <Input type="date" value={form.nextDueAt} onChange={(e) => set("nextDueAt", e.target.value)} required />
      </Field>

      <Field label="Ghi chú" className="sm:col-span-2">
        <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Ghi chú thêm..." />
      </Field>

      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Lưu thay đổi" : "Thêm điểm thay thế"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
