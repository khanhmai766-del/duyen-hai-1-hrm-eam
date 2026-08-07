"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Download, Pencil, Trash2, FileText, Package, UserCog, ExternalLink, QrCode, Loader2, Plus, X, PackagePlus, Cpu, Wrench, PackageCheck, CheckCircle2, ImageIcon, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeviceForm } from "@/components/devices/device-form";
import { DeviceMaterialDeclarationDialog } from "@/components/devices/device-material-declaration-dialog";
import { DefectForm } from "@/components/defects/defect-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PeakProtectedRoute } from "@/components/shared/peak-protected-route";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { CardSkeleton } from "@/components/shared/skeletons";
import { useDevice, useDeleteDevice } from "@/hooks/useDevices";
import { useSeqAccess } from "@/hooks/useSystemAccess";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useAddDeviceQrCard, useRemoveDeviceQrCard } from "@/hooks/useDeviceQrCards";
import { cn, formatDate } from "@/lib/utils";
import { DEFECT_SEVERITY, DEFECT_STATUS, defectSeverityCriteriaLabels } from "@/lib/constants";
import { defaultScopeOf, TREE_SCOPES } from "@/lib/equipment-units";

export default function DeviceDetailPage() {
  return (
    <PeakProtectedRoute>
      <RbacProtectedRoute permissionId="device-view" featureLabel="Thông tin thiết bị">
        <DeviceDetailPageContent />
      </RbacProtectedRoute>
    </PeakProtectedRoute>
  );
}

function DeviceDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMachine = searchParams.get("machine");
  const historyDepth = Math.min(
    3,
    Math.max(0, Number.parseInt(searchParams.get("historyDepth") ?? "2", 10) || 0)
  );
  const { data: session } = useSession();
  const { data, isLoading } = useDevice(id, requestedMachine, historyDepth);
  const del = useDeleteDevice();
  const access = useSeqAccess(data?.data?.id);
  const rbac = useRbacAccess();
  const addQrCard = useAddDeviceQrCard();
  const removeQrCard = useRemoveDeviceQrCard();
  const [editOpen, setEditOpen] = React.useState(false);
  const [delOpen, setDelOpen] = React.useState(false);
  const [qrOpen, setQrOpen] = React.useState(false);
  const [qrDeleteOpen, setQrDeleteOpen] = React.useState(false);
  const [showAllDeclarations, setShowAllDeclarations] = React.useState(false);
  const [showAllUsage, setShowAllUsage] = React.useState(false);
  const [materialOpen, setMaterialOpen] = React.useState(false);
  const [defectOpen, setDefectOpen] = React.useState(false);

  const device = data?.data;
  const url = typeof window !== "undefined" && device ? `${window.location.origin}/public/equipment/${encodeURIComponent(device.code)}` : "";
  const canCreateQr = Boolean(device && rbac.can("device-manage", ["personal", "manage", "full"]) && access.canEdit);
  const canDeleteQr = Boolean(device && rbac.can("device-manage", ["manage", "full"]) && access.canEdit);
  const canDeclareMaterial = Boolean(device && rbac.can("replacement-manage", ["personal", "manage", "full"]) && access.canEdit);
  const canCreateDefect = Boolean(device && rbac.can("defect-manage", ["personal", "manage", "full"]) && access.canEdit);
  const deviceMachine = React.useMemo(() => {
    if (!device) return "S1";
    return device.machine ?? defaultScopeOf(device.id);
  }, [device]);
  // Quay lại đúng CÂY đã mở thiết bị này (S1 / S2 / Dùng chung).
  const treeReturnUrl = device
    ? `/devices?view=tree&scope=${encodeURIComponent(deviceMachine)}&focusSeq=${encodeURIComponent(device.id)}`
    : "/devices?view=tree";
  const fullHistoryUrl = device
    ? `/repair-history?deviceSeq=${encodeURIComponent(device.id)}&mappedUnit=${encodeURIComponent(deviceMachine)}${historyDepth > 0 ? `&includeDescendants=${historyDepth}` : ""}`
    : "/repair-history";
  const fullDefectsUrl = device
    ? `/defects?deviceSeq=${encodeURIComponent(device.id)}&unit=${deviceMachine}&mappedUnit=${deviceMachine}${historyDepth > 0 ? `&includeDescendants=${historyDepth}` : ""}`
    : "/defects";

  function changeHistoryDepth(value: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("historyDepth", value);
    router.replace(`/devices/${encodeURIComponent(id)}?${query.toString()}`, { scroll: false });
  }

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
    <div className="space-y-5">
      {/* Khối định danh: đường lui, tên, mã và tổ máy gom thành MỘT cụm.
          Tổ máy trước nằm lẫn trong hàng nút — nó là thuộc tính của thiết bị,
          không phải hành động, nên chuyển về cạnh mã cho đúng nghĩa và để hàng
          nút bớt một món khỏi bị xuống dòng. */}
      <div>
        <Link
          href={treeReturnUrl}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại cây thiết bị
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-5 gap-y-3.5">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#1e3a5f_0%,#2563eb_100%)] text-white shadow-[0_10px_20px_-10px_rgba(37,99,235,0.9)]">
              <Cpu className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[21px] font-bold leading-snug text-ink">{device.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="font-mono text-[12.5px] font-semibold text-navy">{device.code}</span>
                <span aria-hidden className="h-3 w-px bg-border" />
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1",
                    deviceMachine === "COMMON"
                      ? "bg-teal-50 text-teal-700 ring-teal-200"
                      : deviceMachine === "S2"
                        ? "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200"
                        : "bg-blue-50 text-accent ring-blue-200"
                  )}
                >
                  {TREE_SCOPES.find((s) => s.key === deviceMachine)?.label ?? deviceMachine}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm dark:border-white/10">
              <span className="hidden pl-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:inline">
                Phạm vi lý lịch
              </span>
              <Select value={String(historyDepth)} onValueChange={changeHistoryDepth}>
                <SelectTrigger className="h-8 w-[168px] rounded-lg border-0 bg-slate-50 text-xs font-semibold shadow-none focus:ring-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Chỉ thiết bị này</SelectItem>
                  <SelectItem value="1">Thiết bị con · 1 cấp</SelectItem>
                  <SelectItem value="2">Thiết bị con · 2 cấp</SelectItem>
                  <SelectItem value="3">Thiết bị con · 3 cấp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="toolbar" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" /> Mã QR
            </Button>
            {rbac.can("device-manage", ["manage", "full"]) && access.canEdit && (
              <Button variant="outline" size="toolbar" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Sửa
              </Button>
            )}
            {rbac.can("device-delete", ["full"]) && access.canEdit && (
              <Button variant="outline" size="toolbar" onClick={() => setDelOpen(true)}>
                <Trash2 className="h-4 w-4 text-destructive" /> Xoá
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Cột trái — HỒ SƠ: định danh và vật tư của thiết bị. */}
        <div className="space-y-5 lg:col-span-4">
          <SectionCard icon={Cpu} title="Thông tin thiết bị" tone="navy">
            <dl className="text-sm">
              <Row label="Tổ máy" value={deviceMachine === "COMMON" ? "COMMON · Dùng chung" : deviceMachine} />
              <Row label="Hệ thống" value={device.system ?? "—"} />
              <Row label="Mã KKS" value={device.kks ?? "—"} mono />
              {/* Có thể nhiều cương vị cùng được cấp quyền Sửa trên một nhánh → hiện đủ, không chỉ cương vị gần nhất. */}
              <ManagingPositionsRow positions={device.managingPositions ?? (device.managingPosition ? [device.managingPosition] : [])} />
            </dl>
            {device.attachedInfo && (
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Thông tin đính kèm</div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{device.attachedInfo}</p>
              </div>
            )}
            {device.documentUrl && (
              <a
                href={device.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-blue-50"
              >
                <FileText className="h-4 w-4" /> Tài liệu đính kèm <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </SectionCard>

          {device.images?.length > 0 && (
            <SectionCard icon={ImageIcon} title="Hình ảnh" tone="slate">
              <div className="grid grid-cols-3 gap-2">
                {device.images.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Ảnh ${i + 1}`} className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200 transition-transform hover:scale-105 dark:ring-white/10" />
                  </a>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard
            icon={Package}
            title="Vật tư được khai báo"
            tone="sky"
            actions={
              canDeclareMaterial && (
                <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-lg border-blue-200 text-accent hover:bg-blue-50" onClick={() => setMaterialOpen(true)}>
                  <PackagePlus className="h-4 w-4" /> Khai báo vật tư
                </Button>
              )
            }
          >
            <div className="grid gap-2.5">
              {device.materialDeclarations?.length ? (
                device.materialDeclarations.slice(0, showAllDeclarations ? undefined : 4).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-snug text-ink">{item.material.name}</div>
                      <MachineBadge machine={item.material.machine} />
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {item.location || item.system || "Chưa ghi rõ vị trí"}
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                      Cần thay <b className="font-semibold text-ink">{item.quantity * item.deviceCount} {item.material.unit}</b> · Chu kỳ {item.intervalNote || (item.intervalMonths === 0 ? "Không theo dõi lịch" : `${item.intervalMonths} tháng`)}
                    </div>
                  </div>
                ))
              ) : (
                <div>
                  <EmptyHint icon={Package}>Chưa khai báo vật tư cho thiết bị</EmptyHint>
                </div>
              )}
              {device.materialDeclarations?.length > 4 && (
                <Button variant="ghost" size="sm" className="col-span-full justify-center text-accent" onClick={() => setShowAllDeclarations((value) => !value)}>
                  {showAllDeclarations ? "Thu gọn" : `Xem thêm ${device.materialDeclarations.length - 4} vật tư`}
                </Button>
              )}
            </div>
          </SectionCard>

          <SectionCard icon={PackageCheck} title="Vật tư đã sử dụng" tone="emerald">
            <div className="grid gap-2.5">
              {device.materialUsage?.length ? (
                device.materialUsage.slice(0, showAllUsage ? undefined : 3).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/40 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-snug text-ink">{item.replacement.material.name}</div>
                      <MachineBadge machine={item.replacement.material.machine} />
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {item.replacement.location || item.replacement.system || "Chưa ghi rõ vị trí"}
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {formatDate(item.replacedAt)}{item.quantity ? ` · ${item.quantity} ${item.replacement.material.unit}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <div>
                  <EmptyHint icon={PackageCheck}>Chưa ghi nhận lần thay vật tư nào</EmptyHint>
                </div>
              )}
              {device.materialUsage?.length > 3 && (
                <Button variant="ghost" size="sm" className="col-span-full justify-center text-accent" onClick={() => setShowAllUsage((value) => !value)}>
                  {showAllUsage ? "Thu gọn" : `Xem thêm ${device.materialUsage.length - 3} lần sử dụng`}
                </Button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Cột phải — HOẠT ĐỘNG: lịch sử đã làm và việc đang tồn. */}
        <div className="space-y-5 lg:col-span-8">
          <SectionCard
            icon={Wrench}
            title="Lịch sử sửa chữa"
            tone="sky"
            subtitle={
              device.includesDescendants
                ? `Gồm thiết bị này và ${device.includedDeviceCount! - 1} thiết bị con đến cấp ${historyDepth}`
                : undefined
            }
            actions={
              <Button asChild variant="link" size="sm" className="h-7 px-1">
                <Link href={fullHistoryUrl}>Xem đầy đủ</Link>
              </Button>
            }
          >
            <>
              {device.defectHistory?.length ? (
                // Đường dẫn thời gian: mốc mới nhất ở trên, đường kẻ nhạt dần
                // xuống dưới để mắt biết đâu là đầu chuỗi mà không cần nhãn.
                <ol className="relative space-y-3 pl-6 before:absolute before:inset-y-1 before:left-[5px] before:w-px before:bg-[linear-gradient(180deg,#10b981_0%,#cbd5e1_45%,transparent_100%)]">
                  {device.defectHistory.slice(0, 5).map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute -left-[23px] top-[15px] h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-[hsl(var(--card))]" />
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-sky-200 hover:bg-sky-50/30 dark:border-white/10 dark:bg-white/[0.02]">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-semibold leading-snug text-ink">{item.defectContent || "Chưa ghi nội dung công tác"}</p>
                          <MachineBadge machine={item.unit} />
                        </div>
                        {device.includesDescendants && (
                          <OriginatingDevice item={item} rootSeq={device.id} />
                        )}
                        {item.result && (
                          <p className="mt-1.5 text-[13px] text-muted-foreground">
                            <span className="font-semibold text-ink">Kết quả:</span> {item.result}
                          </p>
                        )}
                        {/* Hàng siêu dữ liệu: tách bằng dấu chấm giữa thay vì khoảng
                            trắng rộng, để 4 mục không trông như 4 cột rời rạc. */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
                          <span>Kết thúc <b className="font-semibold text-ink">{formatDate(item.performedAt)}</b></span>
                          {item.workOrderNumber && <><Dot />PCT {item.workOrderNumber}</>}
                          {item.requestNumber && <><Dot />Yêu cầu {item.requestNumber}</>}
                          {item.createdBy?.name && <><Dot />{item.createdBy.name}</>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyHint icon={Wrench}>Chưa có khiếm khuyết đã hoàn thành</EmptyHint>
              )}
            </>
          </SectionCard>

          <SectionCard
            icon={AlertTriangle}
            title="Khiếm khuyết hiện tại"
            tone="amber"
            count={device.currentDefects?.length ?? 0}
            actions={
              <>
                {canCreateDefect && (
                  <Button size="sm" className="h-8 rounded-lg bg-amber-600 text-white shadow-none hover:bg-amber-700" onClick={() => setDefectOpen(true)}>
                    <Plus className="h-4 w-4" /> Thêm khiếm khuyết
                  </Button>
                )}
                <Button asChild variant="link" size="sm" className="h-7 px-1">
                  <Link href={fullDefectsUrl}>Xem danh sách</Link>
                </Button>
              </>
            }
          >
            <>
              {device.currentDefects?.length ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {device.currentDefects.slice(0, 6).map((defect) => {
                    const status = DEFECT_STATUS[defect.status as keyof typeof DEFECT_STATUS];
                    const severityCriteria = defectSeverityCriteriaLabels(
                      defect.severity,
                      defect.severityCriteria
                    );
                    return (
                      <div key={defect.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <MachineBadge machine={defect.unit} />
                          {defect.severity && (
                            severityCriteria.length > 0 ? (
                              severityCriteria.map((criterion) => (
                                <span
                                  key={criterion}
                                  title={criterion}
                                  className="max-w-full rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
                                >
                                  Mức {defect.severity} · {criterion}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                Mức {defect.severity} · {DEFECT_SEVERITY[defect.severity as keyof typeof DEFECT_SEVERITY]}
                              </span>
                            )
                          )}
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${status?.dot ?? "#64748b"}18`, color: status?.dot ?? "#64748b" }}>{status?.label ?? defect.status}</span>
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm font-medium text-ink">{defect.content || "Chưa nhập nội dung khiếm khuyết"}</p>
                        {device.includesDescendants && (
                          <OriginatingDevice item={defect} rootSeq={device.id} />
                        )}
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
                      Còn {device.currentDefects.length - 6} khiếm khuyết khác · <Link href={fullDefectsUrl} className="font-semibold text-accent hover:underline">Xem danh sách đầy đủ</Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2.5 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-5 text-sm font-medium text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Thiết bị không có khiếm khuyết đang tồn đọng
                </div>
              )}
            </>
          </SectionCard>
        </div>
      </div>

      <DeviceMaterialDeclarationDialog
        open={materialOpen}
        onOpenChange={setMaterialOpen}
        device={{ ...device, code: device.id, displayCode: device.code }}
        machine={deviceMachine}
      />

      {defectOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[1px]" onClick={() => setDefectOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-right">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-amber-50/80 to-white p-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Thêm khiếm khuyết thiết bị</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Thiết bị và hệ thống đã được điền sẵn từ lý lịch.</p>
              </div>
              <button type="button" onClick={() => setDefectOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-white hover:text-ink" aria-label="Đóng">
                <X className="h-5 w-5" />
              </button>
            </div>
            <DefectForm
              initialDevice={{
                code: device.id,
                displayCode: device.code,
                name: device.name,
                system: device.system,
                systemSeq: device.systemSeq,
                managingPosition: device.managingPosition,
                unit: deviceMachine,
              }}
              lockDevice
              onDone={() => setDefectOpen(false)}
              onCancel={() => setDefectOpen(false)}
            />
          </div>
        </div>
      )}

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
              {canDeleteQr && (
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
              {canCreateQr ? (
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

/**
 * Khung thẻ dùng chung cho mọi mục của trang lý lịch thiết bị.
 *
 * Trước đây mỗi thẻ tự dựng CardHeader theo một kiểu — chỗ có icon chỗ không,
 * chỗ có nút chỗ không, viền và bóng đổ cũng khác nhau — nên trang trông chắp
 * vá. Gom về một khung: ô icon màu theo nhóm, tiêu đề, phụ đề tuỳ chọn, số đếm
 * tuỳ chọn, hàng hành động bên phải.
 */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  tone,
  count,
  actions,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone: "navy" | "sky" | "emerald" | "amber" | "slate";
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    navy: "bg-navy/10 text-navy dark:bg-navy/25",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    slate: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300",
  } as const;
  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.6)] dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3.5 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tones[tone])}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-bold leading-tight text-ink">
              <span className="truncate">{title}</span>
              {count ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  {count}
                </span>
              ) : null}
            </h2>
            {subtitle && <p className="mt-0.5 truncate text-[11.5px] font-normal text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

/** Dấu chấm ngăn cách giữa các mục siêu dữ liệu trên một hàng. */
function Dot() {
  return <span aria-hidden className="text-slate-300 dark:text-white/25">·</span>;
}

/** Trạng thái rỗng thống nhất — trước đây mỗi mục hiển thị một kiểu chữ khác nhau. */
function EmptyHint({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/5">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}

/** Cương vị quản lý: liệt kê MỌI cương vị được cấp quyền Sửa trên thiết bị (kế thừa theo nhánh). */
function ManagingPositionsRow({ positions }: { positions: string[] }) {
  return (
    <div className="py-2.5">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <UserCog className="h-3.5 w-3.5" /> Cương vị quản lý
      </dt>
      <dd className="mt-1.5">
        {positions.length === 0 ? (
          <span className="text-[13px] font-medium text-ink">—</span>
        ) : (
          // Danh sách cương vị hay dài; xếp trái theo dòng riêng thay vì ép căn phải
          // cùng hàng với nhãn — trước đây chuỗi chip bị đẩy xuống và lệch hẳn sang phải.
          <span className="flex flex-wrap gap-1.5">
            {positions.map((position) => (
              <span
                key={position}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink dark:bg-white/10"
                title={position}
              >
                {position}
              </span>
            ))}
          </span>
        )}
      </dd>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2.5 dark:border-white/10">
      <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-[13px] font-semibold text-ink", mono && "font-mono tracking-tight")}>
        {value}
      </dd>
    </div>
  );
}

function OriginatingDevice({
  item,
  rootSeq,
}: {
  item: {
    node?: { seq: string; name: string } | null;
    relatedDevices?: Array<{ deviceSeq: string; device: { seq: string; name: string } }>;
  };
  rootSeq: string;
}) {
  const withinTwoLevels = (seq: string) =>
    (seq === rootSeq || seq.startsWith(`${rootSeq}.`))
    && seq.split(".").length - rootSeq.split(".").length <= 2;
  const origin = item.node && withinTwoLevels(item.node.seq)
    ? item.node
    : item.relatedDevices?.find((related) => withinTwoLevels(related.deviceSeq))?.device;
  if (!origin) return null;
  return (
    <p className="mt-2 text-xs text-blue-700">
      <span className="font-semibold">Thiết bị phát sinh:</span> {origin.name}{" "}
      <span className="font-mono text-[11px] text-blue-600">({origin.seq})</span>
    </p>
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
