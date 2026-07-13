"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Download, Pencil, Trash2, FileText, Package, UserCog, ExternalLink, QrCode, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeviceForm } from "@/components/devices/device-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PeakProtectedRoute } from "@/components/shared/peak-protected-route";
import { CardSkeleton } from "@/components/shared/skeletons";
import { useDevice, useDeleteDevice } from "@/hooks/useDevices";
import { useSystemAccess } from "@/hooks/useSystemAccess";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useAddDeviceQrCard, useRemoveDeviceQrCard } from "@/hooks/useDeviceQrCards";
import { formatDate } from "@/lib/utils";
import { DEFECT_SEVERITY, DEFECT_STATUS } from "@/lib/constants";

export default function DeviceDetailPage() {
  return (
    <PeakProtectedRoute>
      <DeviceDetailPageContent />
    </PeakProtectedRoute>
  );
}

function DeviceDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { data, isLoading } = useDevice(id);
  const del = useDeleteDevice();
  const access = useSystemAccess();
  const rbac = useRbacAccess();
  const addQrCard = useAddDeviceQrCard();
  const removeQrCard = useRemoveDeviceQrCard();
  const [editOpen, setEditOpen] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);
  const [qrOpen, setQrOpen] = React.useState(false);
  const [qrDeleteOpen, setQrDeleteOpen] = React.useState(false);
  const [showAllDeclarations, setShowAllDeclarations] = React.useState(false);
  const [showAllUsage, setShowAllUsage] = React.useState(false);

  const device = data?.data;
  const url = typeof window !== "undefined" && device ? `${window.location.origin}/public/equipment/${encodeURIComponent(device.code)}` : "";
  const canManageQr = Boolean(device && rbac.can("device-manage", ["create", "manage", "full"]) && access.canEditDevice(device));

  async function createQrCard() {
    try {
      await addQrCard.mutateAsync(device!.code);
      toast.success("Đã khởi tạo mã QR thiết bị");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không khởi tạo được mã QR");
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
          <h1 className="text-2xl font-bold text-ink">{device.name}</h1>
          <p className="mt-1 font-mono text-sm text-navy">{device.code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setQrOpen(true)}>
            <QrCode className="h-4 w-4" /> Mã QR
          </Button>
          {rbac.can("device-manage", ["manage", "full"]) && access.canEditDevice(device) && (
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Sửa</Button>
          )}
          {rbac.can("device-delete", ["full"]) && (
            <Button variant="outline" onClick={() => setDelOpen(true)}>
              <Trash2 className="h-4 w-4 text-destructive" /> Xoá
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: info + images */}
        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader><CardTitle>Thông tin thiết bị</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Hệ thống" value={device.system ?? "—"} />
              <Row label="Cương vị quản lý" value={device.managingPosition ?? "—"} icon={UserCog} />
              {device.attachedInfo && (
                <div className="pt-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thông tin đính kèm</div>
                  <p className="mt-1 whitespace-pre-wrap text-ink">{device.attachedInfo}</p>
                </div>
              )}
              {device.documentUrl && (
                <a href={device.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 pt-1 text-accent hover:underline">
                  <FileText className="h-4 w-4" /> Tài liệu đính kèm <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>

          {device.images?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Hình ảnh</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                {device.images.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Ảnh ${i + 1}`} className="aspect-square w-full rounded-md border border-border object-cover transition-transform hover:scale-105" />
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

        </div>

        {/* Middle: completed defect history */}
        <div className="lg:col-span-8">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Lịch sử sửa chữa</CardTitle>
              <Button asChild variant="link" size="sm">
                <Link href={`/repair-history?device=${encodeURIComponent(device.code)}`}>Xem đầy đủ</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {device.defectHistory?.length ? (
                <ol className="relative space-y-5 border-l-2 border-border pl-6">
                  {device.defectHistory.slice(0, 3).map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                      <div className="rounded-lg border border-border bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium leading-tight text-ink">{item.content || "Chưa ghi nội dung thực hiện"}</p>
                          <MachineBadge machine={item.unit} />
                        </div>
                        {item.result && <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-ink">Kết quả:</span> {item.result}</p>}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Ngày thực hiện: {formatDate(item.performedAt)}</span>
                          {item.workOrderNumber && <span>PCT: {item.workOrderNumber}</span>}
                          {item.requestNumber && <span>Yêu cầu: {item.requestNumber}</span>}
                          {item.createdBy?.name && <span>Người cập nhật: {item.createdBy.name}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Chưa có khiếm khuyết đã hoàn thành</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Materials: a separate row keeps long names and usage details readable. */}
        <div className="grid gap-6 md:grid-cols-2 lg:col-span-12">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Vật tư được khai báo</CardTitle></CardHeader>
            <CardContent className="grid gap-3 xl:grid-cols-2">
              {device.materialDeclarations?.length ? (
                device.materialDeclarations.slice(0, showAllDeclarations ? undefined : 3).map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-ink">{item.material.name}</div>
                      <MachineBadge machine={item.material.machine} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.location || item.system || "Chưa ghi rõ vị trí"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Cần thay: {item.quantity * item.deviceCount} {item.material.unit} · Chu kỳ {item.intervalNote || `${item.intervalMonths} tháng`}
                    </div>
                  </div>
                ))
              ) : (
                <p className="col-span-full text-sm text-muted-foreground">Chưa khai báo vật tư cho thiết bị.</p>
              )}
              {device.materialDeclarations?.length > 3 && (
                <Button variant="ghost" size="sm" className="col-span-full justify-center text-accent" onClick={() => setShowAllDeclarations((value) => !value)}>
                  {showAllDeclarations ? "Thu gọn" : `Xem thêm ${device.materialDeclarations.length - 3} vật tư`}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Vật tư đã sử dụng</CardTitle></CardHeader>
            <CardContent className="grid gap-3 xl:grid-cols-2">
              {device.materialUsage?.length ? (
                device.materialUsage.slice(0, showAllUsage ? undefined : 3).map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-ink">{item.replacement.material.name}</div>
                      <MachineBadge machine={item.replacement.material.machine} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.replacement.location || item.replacement.system || "Chưa ghi rõ vị trí"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(item.replacedAt)}{item.quantity ? ` · ${item.quantity} ${item.replacement.material.unit}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <p className="col-span-full text-sm text-muted-foreground">Chưa ghi nhận lần thay vật tư nào.</p>
              )}
              {device.materialUsage?.length > 3 && (
                <Button variant="ghost" size="sm" className="col-span-full justify-center text-accent" onClick={() => setShowAllUsage((value) => !value)}>
                  {showAllUsage ? "Thu gọn" : `Xem thêm ${device.materialUsage.length - 3} lần sử dụng`}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Khiếm khuyết hiện tại
            {device.currentDefects?.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{device.currentDefects.length}</span>}
          </CardTitle>
          <Button asChild variant="link" size="sm">
            <Link href={`/defects?deviceSeq=${encodeURIComponent(device.code)}`}>Xem danh sách</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {device.currentDefects?.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {device.currentDefects.slice(0, 6).map((defect) => {
                const status = DEFECT_STATUS[defect.status as keyof typeof DEFECT_STATUS];
                return (
                  <div key={defect.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <MachineBadge machine={defect.unit} />
                      {defect.severity && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Mức {defect.severity} · {DEFECT_SEVERITY[defect.severity as keyof typeof DEFECT_SEVERITY]}</span>}
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${status?.dot ?? "#64748b"}18`, color: status?.dot ?? "#64748b" }}>{status?.label ?? defect.status}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm font-medium text-ink">{defect.content || "Chưa nhập nội dung khiếm khuyết"}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {defect.detectedAt && <span>Phát hiện: {formatDate(defect.detectedAt)}</span>}
                      {defect.requestType && <span>Yêu cầu: {defect.requestType}</span>}
                      {defect.requestNumber && <span>Số: {defect.requestNumber}</span>}
                    </div>
                  </div>
                );
              })}
              {device.currentDefects.length > 6 && (
                <div className="col-span-full rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-4 py-3 text-center text-sm text-amber-800">
                  Còn {device.currentDefects.length - 6} khiếm khuyết khác · <Link href={`/defects?deviceSeq=${encodeURIComponent(device.code)}`} className="font-semibold text-accent hover:underline">Xem danh sách đầy đủ</Link>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center text-sm text-emerald-800">Thiết bị không có khiếm khuyết đang tồn đọng.</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-accent" /> Mã QR thiết bị</DialogTitle>
          </DialogHeader>
          {device.hasQrCard ? (
            <div className="flex flex-col items-center gap-4 pt-2">
              <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                <QRCodeSVG id="device-qr" value={url} size={190} level="M" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-ink">{device.name}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{device.code}</div>
              </div>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="outline" onClick={downloadQr}>
                  <Download className="h-4 w-4" /> Tải QR
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/devices/${id}/qr`}>Trang in</Link>
                </Button>
              </div>
              {canManageQr && (
                <Button variant="ghost" className="w-full text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setQrDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Xóa mã QR
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-5 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-accent shadow-sm"><QrCode className="h-7 w-7" /></span>
              <div>
                <div className="font-semibold text-ink">Thiết bị chưa có mã QR</div>
                <p className="mt-1 text-sm text-muted-foreground">Chỉ khởi tạo cho thiết bị cần dán thẻ hoặc tra cứu bằng mã quét.</p>
              </div>
              {canManageQr ? (
                <Button onClick={createQrCard} disabled={addQrCard.isPending}>
                  {addQrCard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Khởi tạo mã QR
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Bạn không có quyền khởi tạo mã QR cho thiết bị này.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={qrDeleteOpen}
        onOpenChange={setQrDeleteOpen}
        title="Xóa mã QR thiết bị?"
        description="Mã QR sẽ bị gỡ khỏi danh sách thẻ. Thiết bị, lý lịch, vật tư và lịch sử sửa chữa vẫn được giữ nguyên."
        confirmLabel="Xóa mã QR"
        loading={removeQrCard.isPending}
        onConfirm={async () => {
          try {
            await removeQrCard.mutateAsync(device.code);
            toast.success("Đã xóa mã QR thiết bị");
            setQrDeleteOpen(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Không xóa được mã QR");
          }
        }}
      />

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

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-right font-medium text-ink">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}{value}
      </span>
    </div>
  );
}

function MachineBadge({ machine }: { machine: string }) {
  const tone = machine === "S1"
    ? "bg-blue-100 text-blue-800"
    : machine === "S2"
      ? "bg-fuchsia-100 text-fuchsia-800"
      : "bg-amber-100 text-amber-800";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{machine}</span>;
}
