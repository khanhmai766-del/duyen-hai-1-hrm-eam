"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import { useCreateDevice, useUpdateDevice } from "@/hooks/useDevices";
import { usePositions } from "@/hooks/useUsers";
import type { Device } from "@/types";

const NONE = "__none__";

export function DeviceForm({ device, onDone }: { device?: Device | null; onDone?: (d: Device) => void }) {
  const create = useCreateDevice();
  const update = useUpdateDevice();
  const isEdit = !!device;
  const positions = usePositions();

  const [form, setForm] = React.useState({
    code: device?.code ?? "",
    name: device?.name ?? "",
    system: device?.system ?? "",
    managingPosition: device?.managingPosition ?? "",
    images: device?.images ?? [],
    attachedInfo: device?.attachedInfo ?? "",
    documentUrl: device?.documentUrl ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Đảm bảo cương vị hiện tại luôn có trong danh sách (kể cả khi đã đổi tên/xoá).
  const positionOptions =
    form.managingPosition && !positions.includes(form.managingPosition)
      ? [form.managingPosition, ...positions]
      : positions;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return toast.error("Nhập Mã và Tên thiết bị");
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
          <Field label="Hệ thống">
            <Input value={form.system} onChange={(e) => set("system", e.target.value)} placeholder="VD: Lò hơi, FGD, ESP…" />
          </Field>
          <Field label="Cương vị quản lý">
            <Select value={form.managingPosition || NONE} onValueChange={(v) => set("managingPosition", v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Không chọn —</SelectItem>
                {positionOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ảnh (tối đa 3)" className="md:col-span-2">
            <MultiImagePicker value={form.images} onChange={(v) => set("images", v)} max={3} allowUrl />
          </Field>
          <Field label="Thông tin đính kèm theo" className="md:col-span-2">
            <Textarea value={form.attachedInfo} onChange={(e) => set("attachedInfo", e.target.value)} rows={3} placeholder="Ghi chú, thông số, lưu ý…" />
          </Field>
          <Field label="Tài liệu đính kèm (link)" className="md:col-span-2">
            <Input value={form.documentUrl} onChange={(e) => set("documentUrl", e.target.value)} placeholder="https://… (PDF / Google Drive)" />
          </Field>
          <Field label="Mã QR (sinh từ mã thiết bị)" className="md:col-span-2">
            <div className="flex items-center gap-4 rounded-lg border border-border p-3">
              <div className="rounded-md border border-border bg-white p-2">
                <QRCodeSVG value={form.code || "—"} size={96} level="M" />
              </div>
              <p className="text-sm text-muted-foreground">
                Mã QR tự sinh theo Mã thiết bị. Sau khi lưu, QR sẽ liên kết tới trang chi tiết thiết bị.
              </p>
            </div>
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
