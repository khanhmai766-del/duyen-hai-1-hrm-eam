"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEVICE_CATEGORIES, DEVICE_STATUS_ORDER, DEVICE_STATUS } from "@/lib/constants";
import { useCreateDevice, useUpdateDevice } from "@/hooks/useDevices";
import type { Device } from "@/types";

export function DeviceForm({ device, onDone }: { device?: Device | null; onDone?: (d: Device) => void }) {
  const create = useCreateDevice();
  const update = useUpdateDevice();
  const isEdit = !!device;

  const [form, setForm] = React.useState({
    code: device?.code ?? "",
    name: device?.name ?? "",
    category: device?.category ?? "ESP",
    location: device?.location ?? "",
    manufacturer: device?.manufacturer ?? "",
    model: device?.model ?? "",
    serialNumber: device?.serialNumber ?? "",
    status: device?.status ?? "NORMAL",
    installDate: device?.installDate ? new Date(device.installDate).toISOString().slice(0, 10) : "",
    warrantyUntil: device?.warrantyUntil ? new Date(device.warrantyUntil).toISOString().slice(0, 10) : "",
    imageUrl: device?.imageUrl ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = isEdit
        ? await update.mutateAsync({ id: device!.id, ...form })
        : await create.mutateAsync(form);
      toast.success(isEdit ? "Đã cập nhật thiết bị" : "Đã thêm thiết bị mới");
      onDone?.(result);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? `Chỉnh sửa: ${device!.code}` : "Thêm thiết bị mới"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Mã thiết bị *">
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} disabled={isEdit} required placeholder="ESP-S1-001" />
          </Field>
          <Field label="Tên thiết bị *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Loại thiết bị *">
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVICE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vị trí *">
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} required />
          </Field>
          <Field label="Trạng thái">
            <Select value={form.status} onValueChange={(v) => set("status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVICE_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{DEVICE_STATUS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nhà sản xuất">
            <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field label="Số serial">
            <Input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} />
          </Field>
          <Field label="Ngày lắp đặt">
            <Input type="date" value={form.installDate} onChange={(e) => set("installDate", e.target.value)} />
          </Field>
          <Field label="Bảo hành đến">
            <Input type="date" value={form.warrantyUntil} onChange={(e) => set("warrantyUntil", e.target.value)} />
          </Field>
          <Field label="Ảnh (URL)" className="md:col-span-2">
            <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." />
          </Field>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Thêm thiết bị"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
