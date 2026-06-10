"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ArrowLeft, Cpu, Download, Pencil, Trash2, FileText, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/devices/status-badge";
import { RepairTimeline } from "@/components/repair/repair-timeline";
import { DeviceForm } from "@/components/devices/device-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CardSkeleton } from "@/components/shared/skeletons";
import { useDevice, useUpdateDevice, useDeleteDevice } from "@/hooks/useDevices";
import { DEVICE_STATUS_ORDER, DEVICE_STATUS, can } from "@/lib/constants";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { data, isLoading } = useDevice(id);
  const update = useUpdateDevice();
  const del = useDeleteDevice();
  const [editOpen, setEditOpen] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);

  const device = data?.data;
  const url = typeof window !== "undefined" ? `${window.location.origin}/devices/${id}` : "";

  async function changeStatus(status: string) {
    if (!device) return;
    try {
      await update.mutateAsync({ ...device, id: device.id, status });
      toast.success("Đã cập nhật trạng thái");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function downloadQr() {
    const svg = document.getElementById("device-qr");
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${device?.code}-qr.svg`;
    a.click();
  }

  if (isLoading) return <div className="grid gap-6 lg:grid-cols-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  if (!device) return <p className="text-muted-foreground">Không tìm thấy thiết bị.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/devices"><ArrowLeft className="h-4 w-4" /> Danh sách</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">{device.name}</h1>
            <StatusBadge status={device.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-navy">{device.code}</p>
        </div>
        <div className="flex gap-2">
          {can(session?.user?.role, "createRepair") && (
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Sửa</Button>
          )}
          {can(session?.user?.role, "deleteDevice") && (
            <Button variant="outline" onClick={() => setDelOpen(true)}>
              <Trash2 className="h-4 w-4 text-destructive" /> Xoá
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: info + QR (30%) */}
        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader><CardTitle>Thông tin thiết bị</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Loại" value={device.category} />
              <Row label="Vị trí" value={device.location} />
              <Row label="Nhà sản xuất" value={device.manufacturer ?? "—"} />
              <Row label="Model" value={device.model ?? "—"} />
              <Row label="Số serial" value={device.serialNumber ?? "—"} />
              <Row label="Ngày lắp đặt" value={formatDate(device.installDate)} />
              <Row label="Bảo hành đến" value={formatDate(device.warrantyUntil)} />
              {device.specs && typeof device.specs === "object" &&
                Object.entries(device.specs as Record<string, string>).map(([k, v]) => (
                  <Row key={k} label={k} value={String(v)} />
                ))}
              <div className="pt-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Đổi trạng thái</label>
                <Select value={device.status} onValueChange={changeStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEVICE_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>{DEVICE_STATUS[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Mã QR</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <div className="rounded-xl border border-border p-3">
                <QRCodeSVG id="device-qr" value={url} size={150} level="M" />
              </div>
              <div className="flex w-full gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={downloadQr}>
                  <Download className="h-4 w-4" /> Tải QR
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/devices/${id}/qr`}>Trang in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle: repair timeline (45%) */}
        <div className="lg:col-span-5">
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Lịch sử sửa chữa</CardTitle>
              <Button asChild variant="link" size="sm">
                <Link href={`/repair-history/${id}`}>Xem đầy đủ</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <RepairTimeline entries={device.repairLogs as any} />
            </CardContent>
          </Card>
        </div>

        {/* Right: materials + docs (25%) */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Vật tư sử dụng</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {device.materials.length ? (
                device.materials.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="font-medium text-ink">{m.material.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.quantity} {m.material.unit} · {formatDate(m.usedAt)}
                    </div>
                    {m.note && <div className="mt-1 text-xs text-muted-foreground">{m.note}</div>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có vật tư.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Tài liệu</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Chưa có tài liệu đính kèm.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Chỉnh sửa thiết bị</DialogTitle></DialogHeader>
          <DeviceForm device={device} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title="Xoá thiết bị?"
        description={`Xoá "${device.name}" và toàn bộ lịch sử liên quan?`}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(device.id);
            toast.success("Đã xoá thiết bị");
            router.push("/devices");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
