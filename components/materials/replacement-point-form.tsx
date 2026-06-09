"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMaterials } from "@/hooks/useMaterials";
import { useCreateReplacement, useUpdateReplacement, type ReplacementItem } from "@/hooks/useReplacements";
import { addMonths, MATERIAL_SYSTEMS } from "@/lib/constants";

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

type LocMode = "EXISTING" | "CUSTOM";
const NO_SYSTEM = "__none__";

export function ReplacementPointForm({
  materialId,
  point,
  defaultSystem,
  lockedLocation,
  onDone,
}: {
  materialId: string;
  point?: ReplacementItem | null;
  /** Hệ thống mặc định khi tạo mới — lấy theo hệ thống của vật tư. */
  defaultSystem?: string | null;
  /**
   * Khoá vị trí thay thế theo vật tư: khi có giá trị, trường vị trí cố định
   * (bằng vị trí thay thế của vật tư) và không cho user chỉnh sửa.
   */
  lockedLocation?: string | null;
  onDone?: () => void;
}) {
  const isEdit = !!point;
  const lockedLoc = (lockedLocation ?? "").trim();
  const isLocked = !!lockedLoc;
  const create = useCreateReplacement();
  const update = useUpdateReplacement();
  const { data: materialsData } = useMaterials();
  const materials = materialsData?.data ?? [];

  // (Chỉ dùng khi KHÔNG khoá) danh sách "Vị trí thay thế" có sẵn từ danh mục.
  const knownLocations = React.useMemo(
    () => Array.from(new Set(materials.map((m) => (m.location ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [materials]
  );

  const [mode, setMode] = React.useState<LocMode>(isEdit ? "CUSTOM" : "EXISTING");
  const [form, setForm] = React.useState({
    location: isLocked ? lockedLoc : (point?.location ?? ""),
    system: isEdit ? (point?.system ?? "") : (defaultSystem ?? ""),
    intervalMonths: String(point?.intervalMonths ?? 6),
    intervalNote: point?.intervalNote ?? "",
    lastReplacedAt: toDateInput(point?.lastReplacedAt),
    nextDueAt: toDateInput(point?.nextDueAt),
    note: point?.note ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function recompute(next: typeof form) {
    const base = next.lastReplacedAt ? new Date(next.lastReplacedAt) : new Date();
    const months = Number(next.intervalMonths) || 0;
    return months > 0 ? toDateInput(addMonths(base, months)) : next.nextDueAt;
  }
  function onIntervalChange(v: string) {
    setForm((f) => ({ ...f, intervalMonths: v, nextDueAt: recompute({ ...f, intervalMonths: v }) }));
  }
  function onLastChange(v: string) {
    setForm((f) => ({ ...f, lastReplacedAt: v, nextDueAt: recompute({ ...f, lastReplacedAt: v }) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const location = isLocked ? lockedLoc : form.location.trim();
    if (!location) return toast.error("Vui lòng chọn / nhập vị trí thay thế");
    if (!form.nextDueAt) return toast.error("Vui lòng nhập ngày đến hạn");

    const payload = {
      materialId,
      deviceId: null,
      location,
      system: form.system || null,
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
      {/* Vị trí thay thế */}
      <div className="sm:col-span-2">
        <Label className="mb-1.5 block">Vị trí thay thế *</Label>
        {isLocked ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-ink">
              <MapPin className="h-4 w-4 shrink-0 text-accent" />
              <span className="font-medium">{lockedLoc}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Theo vị trí thay thế của vật tư — không thể thay đổi.</p>
          </>
        ) : (
          <>
            <div className="mb-2 inline-flex rounded-lg border border-border p-0.5 text-sm">
              <button type="button" onClick={() => setMode("EXISTING")}
                className={mode === "EXISTING" ? "rounded-md bg-navy px-3 py-1 text-white" : "px-3 py-1 text-muted-foreground"}>
                Vị trí có sẵn
              </button>
              <button type="button" onClick={() => setMode("CUSTOM")}
                className={mode === "CUSTOM" ? "rounded-md bg-navy px-3 py-1 text-white" : "px-3 py-1 text-muted-foreground"}>
                Vị trí tự do
              </button>
            </div>
            {mode === "EXISTING" ? (
              <Select value={form.location || undefined} onValueChange={(v) => set("location", v)}>
                <SelectTrigger><SelectValue placeholder={knownLocations.length ? "Chọn vị trí thay thế" : "Chưa có vị trí — nhập ở 'Vị trí tự do'"} /></SelectTrigger>
                <SelectContent>
                  {knownLocations.map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="VD: Trạm dầu ĐCC Máy Nghiền" />
            )}
          </>
        )}
      </div>

      <div className="sm:col-span-2">
        <Label className="mb-1.5 block">Hệ thống</Label>
        <Select value={form.system || NO_SYSTEM} onValueChange={(v) => set("system", v === NO_SYSTEM ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Chọn hệ thống" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SYSTEM}>— Không chọn —</SelectItem>
            {MATERIAL_SYSTEMS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
