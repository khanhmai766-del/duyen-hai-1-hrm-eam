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

const NO_SYSTEM = "__none__";
const NO_DEVICE = "__none__";
const NO_POSITION = "__none__";

export function ReplacementPointForm({
  materialId,
  point,
  defaultSystem,
  onDone,
}: {
  materialId: string;
  point?: ReplacementItem | null;
  /** Hệ thống mặc định khi tạo mới — lấy theo hệ thống của vật tư. */
  defaultSystem?: string | null;
  onDone?: () => void;
}) {
  const isEdit = !!point;
  const create = useCreateReplacement();
  const update = useUpdateReplacement();
  const { data: devicesData } = useDevices({});
  const devices = devicesData?.data ?? [];
  const devicePositions = React.useMemo(
    () => Array.from(new Set(devices.map((device) => device.managingPosition).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, "vi")),
    [devices]
  );

  const [form, setForm] = React.useState({
    deviceId: point?.deviceId ?? "",
    managingPosition: "",
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
  const positionDevices = React.useMemo(
    () => devices.filter((device) => !form.managingPosition || device.managingPosition === form.managingPosition),
    [devices, form.managingPosition]
  );
  const deviceSystems = React.useMemo(
    () => Array.from(new Set(positionDevices.map((device) => device.system).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, "vi")),
    [positionDevices]
  );
  const filteredDevices = React.useMemo(
    () => positionDevices.filter((device) => !form.system || device.system === form.system),
    [positionDevices, form.system]
  );
  function setDevice(deviceId: string) {
    setForm((f) => {
      const nextDeviceId = deviceId === NO_DEVICE ? "" : deviceId;
      const device = devices.find((d) => d.id === nextDeviceId);
      return {
        ...f,
        deviceId: nextDeviceId,
        managingPosition: device?.managingPosition ?? "",
        system: device?.system ?? "",
      };
    });
  }
  function setPosition(position: string) {
    setForm((f) => {
      const managingPosition = position === NO_POSITION ? "" : position;
      const selectedDevice = devices.find((d) => d.id === f.deviceId);
      const positionDevices = devices.filter((d) => !managingPosition || d.managingPosition === managingPosition);
      const keepSystem = !f.system || positionDevices.some((d) => d.system === f.system);
      const nextSystem = keepSystem ? f.system : "";
      const keepDevice =
        !selectedDevice ||
        ((!managingPosition || selectedDevice.managingPosition === managingPosition) &&
          (!nextSystem || selectedDevice.system === nextSystem));
      return {
        ...f,
        managingPosition,
        deviceId: keepDevice ? f.deviceId : "",
        system: nextSystem,
      };
    });
  }
  function setSystem(systemValue: string) {
    setForm((f) => {
      const system = systemValue === NO_SYSTEM ? "" : systemValue;
      const selectedDevice = devices.find((d) => d.id === f.deviceId);
      const keepDevice =
        !selectedDevice ||
        ((!f.managingPosition || selectedDevice.managingPosition === f.managingPosition) &&
          (!system || selectedDevice.system === system));
      return {
        ...f,
        system,
        deviceId: keepDevice ? f.deviceId : "",
      };
    });
  }

  React.useEffect(() => {
    if (!form.deviceId) return;
    const device = devices.find((d) => d.id === form.deviceId);
    if (!device) return;
    const managingPosition = device.managingPosition ?? "";
    const system = device.system ?? "";
    if (form.managingPosition === managingPosition && form.system === system) return;
    setForm((f) => ({ ...f, managingPosition, system }));
  }, [devices, form.deviceId, form.managingPosition, form.system]);

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
    if (!form.managingPosition) return toast.error("Vui lòng chọn cương vị");
    if (!form.system) return toast.error("Vui lòng chọn hệ thống");
    if (!form.deviceId) return toast.error("Vui lòng chọn thiết bị");
    if (!form.nextDueAt) return toast.error("Vui lòng nhập ngày đến hạn");

    const payload = {
      materialId,
      deviceId: form.deviceId,
      location: null,
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
      <div>
        <Label className="mb-1.5 block">Cương vị *</Label>
        <Select value={form.managingPosition || NO_POSITION} onValueChange={setPosition}>
          <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
          <SelectContent>
            {devicePositions.map((position) => (
              <SelectItem key={position} value={position}>{position}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1.5 block">Hệ thống *</Label>
        <Select value={form.system || NO_SYSTEM} onValueChange={setSystem}>
          <SelectTrigger><SelectValue placeholder="Chọn hệ thống" /></SelectTrigger>
          <SelectContent>
            {deviceSystems.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2">
        <Label className="mb-1.5 block">Thiết bị *</Label>
        <Select value={form.deviceId || NO_DEVICE} onValueChange={setDevice}>
          <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
          <SelectContent>
            {filteredDevices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name} ({device.code})
              </SelectItem>
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
