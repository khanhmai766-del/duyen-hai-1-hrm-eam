"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";

import { LayoutGrid, FilePlus2, Cpu, QrCode, Eye, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ShieldAlert, Network, Wrench, Package, Plus, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeviceForm } from "@/components/devices/device-form";
import { DeviceGuideButton } from "@/components/devices/device-guide-button";
import { EquipmentTreeView } from "@/components/devices/equipment-tree";
import { defaultScopeOf, parseScope, scopeCode, seqInScope, TREE_SCOPES, type TreeScope } from "@/lib/equipment-units";
import { QRModal } from "@/components/devices/qr-modal";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { type DeviceListItem } from "@/hooks/useDevices";
import { useDeviceQrCards, useAddDeviceQrCard, useRemoveDeviceQrCard } from "@/hooks/useDeviceQrCards";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import { type EquipmentNode, type TreeNode } from "@/hooks/useEquipment";
import { apiGet } from "@/lib/fetcher";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { normalizeText } from "@/lib/nav";

import { formatDate, cn } from "@/lib/utils";
import { deviceDetailUrl, deviceQrValue } from "@/lib/device-qr";
import { buildEquipmentTreeIndex, compareEquipmentSeq } from "@/lib/equipment-tree";

type ViewMode = "tree" | "detail" | "form";
const VIEWS: { key: ViewMode; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { key: "tree", label: "Cây thiết bị", icon: Network },
  { key: "detail", label: "Thẻ", icon: LayoutGrid },
  { key: "form", label: "Thêm mới", icon: FilePlus2, adminOnly: true },
];

export default function DevicesPage() {
  return (
    <RbacProtectedRoute permissionId="device-view" featureLabel="Thông tin thiết bị">
      <DevicesPageContent />
    </RbacProtectedRoute>
  );
}

function DevicesPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rbac = useRbacAccess();
  const { data: session } = useSession();
  // Tài liệu hướng dẫn dùng chung toàn phân xưởng: chỉ Quản trị hệ thống được
  // thay hoặc xoá, các cương vị khác chỉ xem và tải xuống.
  const isSystemAdmin = session?.user?.role === "ADMIN";
  const canCreateDevices = rbac.can("device-manage", ["personal", "manage", "full"]);
  const canManageDevices = rbac.can("device-manage", ["manage", "full"]);
  const canEditDevices = rbac.can("device-manage", ["manage", "full"]);
  const canDeleteDevices = rbac.can("device-delete", ["full"]);
  const requestedView = params.get("view");
  const view: ViewMode = requestedView === "detail" || requestedView === "form" ? requestedView : "tree";
  const urlQ = params.get("q") ?? "";
  const parentSeq = params.get("parentSeq") ?? "";

  const [q, setQ] = React.useState(urlQ);
  const [debouncedQ, setDebouncedQ] = React.useState(urlQ);
  const [qrDevice, setQrDevice] = React.useState<DeviceListItem | null>(null);

  React.useEffect(() => {
    if (!requestedView || requestedView === view) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("view", "tree");
    sp.delete("systemSeq");
    router.replace(`/devices?${sp.toString()}`);
  }, [params, requestedView, router, view]);

  // URL đổi (link, back/forward) thì nạp lại ô tìm — chỉnh lúc render; giá trị đầu đã lấy từ URL ở useState.
  const [qSyncedUrl, setQSyncedUrl] = React.useState(urlQ);
  if (qSyncedUrl !== urlQ) {
    setQSyncedUrl(urlQ);
    setQ(urlQ);
    setDebouncedQ(urlQ);
  }

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  function setView(v: ViewMode) {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    if (v !== "form") sp.delete("parentSeq");
    router.push(`/devices?${sp.toString()}`);
  }

  function openCreateForSystem(node: TreeNode) {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", "form");
    sp.set("parentSeq", node.seq);
    router.push(`/devices?${sp.toString()}`);
  }

  // `n` keyboard shortcut -> open form view (admin only)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" && canCreateDevices && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setView("form");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, canCreateDevices]);

  const visibleViews = VIEWS.filter((v) => !v.adminOnly || canCreateDevices);

  // Xuất báo cáo cây thiết bị: tải toàn bộ node NGAY KHI bấm xuất (lazy) — không tải khi mở trang.
  // Chỉ xuất PHẠM VI đang xem (Tổ máy S1 / Tổ máy S2 / Dùng chung) cho khớp cây trên màn hình.
  const treeScope = parseScope(params.get("scope"));
  const getTreeExportRows = React.useCallback(async () => {
    const nodes = (await apiGet<EquipmentNode[]>("/api/equipment-tree")).data.filter((n) =>
      seqInScope(n.seq, treeScope)
    );
    return buildTreeExportRows(nodes, treeScope);
  }, [treeScope]);

  return (
    <div className="space-y-6">
      <PageHeader title="THÔNG TIN THIẾT BỊ" description="Lý lịch & quản lý tài sản thiết bị nhà máy">
        <DeviceGuideButton canManage={isSystemAdmin} />
        {view === "tree" && (
          <ExportButton
            getRows={getTreeExportRows}
            filename={`cay-thiet-bi-${treeScope.toLowerCase()}`}
            title={`Danh mục cây thiết bị — ${TREE_SCOPES.find((s) => s.key === treeScope)?.label ?? treeScope}`}
            widths={{ seq: 12, level: 6, name: 40, parentName: 32, classification: 20, drawing: 16, hasProfile: 10 }}
          />
        )}
      </PageHeader>

      {/* View tabs + (when listing) tìm kiếm & bộ lọc hệ thống căn phải */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {visibleViews.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  view === v.key ? "bg-navy text-white" : "text-muted-foreground hover:bg-muted hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </button>
            );
          })}
        </div>
        {view === "detail" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:ml-auto">
            <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, hệ thống..." className="sm:w-72" shortcut />
          </div>
        )}
      </div>

      {view === "tree" ? (
        <EquipmentTreeView
          canDelete={canDeleteDevices}
          canEdit={canEditDevices}
          canCreate={canCreateDevices}
          canMove={canEditDevices}
          onCreateChild={openCreateForSystem}
        />
      ) : view === "detail" ? (
        <QrCardsSection canCreate={canCreateDevices} canDelete={canManageDevices} q={debouncedQ} onQr={setQrDevice} />
      ) : view === "form" ? (
        canCreateDevices ? (
          <DeviceForm
            initialParentSeq={parentSeq || undefined}
            initialScope={parseScope(params.get("scope"))}
            onDone={(device) => {
              const sp = new URLSearchParams(params.toString());
              sp.set("view", "tree");
              sp.set("focusSeq", device.code);
              sp.delete("parentSeq");
              router.push(`/devices?${sp.toString()}`);
            }}
          />
        ) : (
          <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <p className="font-medium text-ink">Bạn không có quyền thêm thiết bị</p>
            <p className="text-sm text-muted-foreground">Bạn chưa có quyền thêm thiết bị mới.</p>
          </CardContent></Card>
        )
      ) : null}

      {qrDevice && (
        <QRModal open={!!qrDevice} onOpenChange={(o) => !o && setQrDevice(null)} device={qrDevice} />
      )}
    </div>
  );
}

/** Tab "Thẻ": chỉ hiển thị các thiết bị ĐÃ ĐƯỢC CHỌN tạo thẻ QR — chọn từ cây thư mục,
 *  không sinh thẻ hàng loạt cho toàn bộ node lá như trước. */
function QrCardsSection({ canCreate, canDelete, q, onQr }: { canCreate: boolean; canDelete: boolean; q: string; onQr: (d: DeviceListItem) => void }) {
  const { data, isLoading } = useDeviceQrCards();
  const add = useAddDeviceQrCard();
  const removeCard = useRemoveDeviceQrCard();
  const [picked, setPicked] = React.useState<{ seq: string; name: string; machine: TreeScope } | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<DeviceListItem | null>(null);

  const allCards = data?.data ?? [];
  const nq = normalizeText(q);
  const cards = nq
    ? allCards.filter((d) => normalizeText([d.code, d.name, d.system].filter(Boolean).join(" ")).includes(nq))
    : allCards;

  async function addCard() {
    if (!picked?.seq) return toast.error("Chọn thiết bị từ cây thư mục trước");
    try {
      await add.mutateAsync({ deviceSeq: picked.seq, machine: picked.machine });
      toast.success(`Đã tạo thẻ QR: ${picked.seq} — ${picked.name}`);
      setPicked(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-sm font-semibold text-ink">Chọn thiết bị tạo thẻ QR</div>
              <EquipmentTreePicker
                value={picked?.seq ?? ""}
                onChange={(node) => setPicked(node ? { seq: node.seq, name: node.name, machine: node.machine } : null)}
                includeLeaves
                placeholder="Chọn thiết bị hoặc thư mục cha từ cây..."
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Có thể tạo QR cho thiết bị lá hoặc thiết bị lớn/thư mục cha để tra cứu dữ liệu tổng hợp của nhánh.
              </p>
            </div>
            <Button onClick={addCard} disabled={add.isPending || !picked?.seq} className="shrink-0 sm:mt-6">
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm thẻ QR
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DetailView devices={cards} canDelete={canDelete} onQr={onQr} onDelete={setRemoveTarget} />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Gỡ thẻ QR thiết bị?"
        description={removeTarget ? `Gỡ thẻ QR của "${removeTarget.code} — ${removeTarget.name}". Mã đã in sẽ bị vô hiệu hóa ngay; thiết bị và dữ liệu liên quan vẫn được giữ nguyên.` : undefined}
        confirmLabel="Gỡ thẻ"
        loading={removeCard.isPending}
        onConfirm={async () => {
          if (!removeTarget) return;
          try {
            await removeCard.mutateAsync({ deviceSeq: removeTarget.id, machine: removeTarget.machine });
            toast.success("Đã gỡ thẻ QR — thiết bị vẫn giữ nguyên");
            setRemoveTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function lastRepair(d: DeviceListItem) {
  return d.repairLogs?.[0]?.startedAt ? formatDate(d.repairLogs[0].startedAt) : "—";
}

/** Dựng dữ liệu xuất báo cáo cho TOÀN BỘ cây thiết bị (sắp theo số thứ tự phân cấp). */
function buildTreeExportRows(nodes: EquipmentNode[], scope: TreeScope): Record<string, unknown>[] {
  const { bySeq, parentOf, childrenOf } = buildEquipmentTreeIndex(nodes);
  return [...nodes]
    .sort((a, b) => compareEquipmentSeq(a.seq, b.seq))
    .map((n) => {
      const kids = childrenOf.get(n.seq)?.length ?? 0;
      const parentSeq = parentOf.get(n.seq);
      const parent = parentSeq ? bySeq.get(parentSeq) : null;
      return {
        seq: scopeCode(n.seq, scope),
        level: (n.depth ?? 0) + 1,
        name: n.name,
        parentName: parent ? `${scopeCode(parent.seq, scope)} · ${parent.name}` : "(Gốc)",
        classification: kids > 0 ? `Nhóm — ${kids} thiết bị con` : "Thiết bị",
        drawing: n.drawing || "",
        hasProfile: n.deviceId ? "Có" : "",
      };
    });
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium text-ink" title={value}>{value}</div>
    </div>
  );
}

function PageButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8 rounded-lg disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
function DetailView({
  devices,
  canDelete,
  onQr,
  onDelete,
}: {
  devices: DeviceListItem[];
  canDelete: boolean;
  onQr: (d: DeviceListItem) => void;
  onDelete: (d: DeviceListItem) => void;
}) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(24);
  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));
  const firstShown = devices.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, devices.length);
  const pagedDevices = devices.slice((page - 1) * pageSize, page * pageSize);
  // Số trang đổi thì kéo trang về trong [1, số trang]; danh sách (prop devices) hoặc cỡ trang đổi thì về trang 1.
  // Chỉnh lúc render thay cho useEffect.
  const [pageClampTotal, setPageClampTotal] = React.useState(totalPages);
  if (pageClampTotal !== totalPages) {
    setPageClampTotal(totalPages);
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }
  const [pageResetKey, setPageResetKey] = React.useState({ devices, pageSize });
  if (pageResetKey.devices !== devices || pageResetKey.pageSize !== pageSize) {
    setPageResetKey({ devices, pageSize });
    setPage(1);
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="Chưa có thẻ QR thiết bị"
        description="Chọn thiết bị quan trọng từ cây thư mục ở trên và bấm “Thêm thẻ QR” để tạo. Chỉ những thiết bị được chọn mới hiện thẻ ở đây."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-ink">THẺ THÔNG TIN THIẾT BỊ</div>
          <div className="text-xs text-muted-foreground">
            {devices.length} thiết bị được chọn tạo thẻ QR, liên kết trực tiếp QR, sửa chữa và vật tư.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <span className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 font-semibold text-sky-700">
            {devices.length}<br /><span className="font-normal">Thiết bị</span>
          </span>
          <span className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 font-semibold text-amber-700">
            {devices.reduce((sum, item) => sum + (item._count?.repairLogs ?? 0), 0)}<br /><span className="font-normal">Phiếu sửa</span>
          </span>
          <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">
            QR<br /><span className="font-normal">Công khai</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {pagedDevices.map((d) => {
          const machine = parseScope(d.machine ?? defaultScopeOf(d.id));
          const detailUrl = deviceDetailUrl(d.id, machine);
          return (
          <Card
            key={d.qrCardKey ?? `${d.id}:${d.machine ?? ""}`}
            role="button"
            tabIndex={0}
            onClick={() => router.push(detailUrl)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); router.push(detailUrl); }
            }}
            className="group overflow-hidden border-border bg-white transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
          >
            <div className="relative h-36 overflow-hidden bg-[linear-gradient(135deg,#0f2748_0%,#0f766e_100%)]">
              {d.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.images[0]} alt={d.name} className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Cpu className="h-12 w-12 text-white/55" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-navy/75 via-navy/15 to-transparent" />
              <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[11px] font-bold text-navy shadow-sm">
                {d.code}
              </div>
              <button
                type="button"
                className="absolute right-3 top-3 rounded-full bg-white p-2 text-navy shadow-sm transition-colors hover:bg-sky-50"
                title="Xem mã QR"
                onClick={(event) => {
                  event.stopPropagation();
                  onQr(d);
                }}
              >
                <QrCode className="h-4 w-4" />
              </button>
              <div className="absolute bottom-3 left-3 right-3">
                <h3 className="line-clamp-2 text-base font-bold leading-tight text-white" title={d.name}>{d.name}</h3>
                <p className="mt-1 truncate text-xs text-white/80" title={d.system ?? ""}>{d.system ?? "Chưa gắn hệ thống"}</p>
              </div>
            </div>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="min-w-0 space-y-2">
                  <InfoPill label="Thư mục" value={d.system ?? "—"} />
                  <InfoPill label="Cương vị" value={d.managingPosition ?? "—"} />
                </div>
                <div className="flex h-[104px] w-[104px] items-center justify-center rounded-xl border border-dashed border-border bg-white p-2">
                  <QRCodeSVG value={deviceQrValue(d.id, d.machine, typeof window !== "undefined" ? window.location.origin : null)} size={82} includeMargin={false} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/repair-history?deviceSeq=${encodeURIComponent(d.id)}&mappedUnit=${machine}`}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors hover:border-blue-200 hover:bg-blue-50"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> Sửa chữa</div>
                  <div className="mt-1 text-sm font-bold text-ink">{d._count?.repairLogs ?? 0} phiếu</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">Gần nhất {lastRepair(d)}</div>
                </Link>
                <Link
                  href={`/materials?deviceId=${encodeURIComponent(d.id)}`}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Package className="h-3.5 w-3.5" /> Vật tư</div>
                  <div className="mt-1 text-sm font-bold text-ink">Tra cứu</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">Danh mục vật tư</div>
                </Link>
              </div>

              <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                <Button asChild size="sm" className="flex-1">
                  <Link href={detailUrl}>
                    <Eye className="h-4 w-4" /> Xem lý lịch
                  </Link>
                </Button>
                {canDelete && (
                  <Button size="sm" variant="outline" title="Gỡ thẻ QR (không xoá thiết bị)" onClick={() => onDelete(d)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <CardGridPagination
        firstShown={firstShown}
        lastShown={lastShown}
        total={devices.length}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageSize={setPageSize}
        onPage={setPage}
      />
    </div>
  );
}

function CardGridPagination({
  firstShown,
  lastShown,
  total,
  page,
  totalPages,
  pageSize,
  onPageSize,
  onPage,
}: {
  firstShown: number;
  lastShown: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageSize: (n: number) => void;
  onPage: (updater: (current: number) => number) => void;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        Hiển thị {firstShown}-{lastShown} trong tổng số {total.toLocaleString("vi-VN")} thiết bị
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span>Hiển thị</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink shadow-none"
          aria-label="Số thẻ hiển thị"
        >
          {[12, 24, 48, 96].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>thẻ</span>
        <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => onPage(() => 1)} />
        <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => onPage((current) => Math.max(1, current - 1))} />
        <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">
          {page}/{totalPages}
        </span>
        <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => onPage((current) => Math.min(totalPages, current + 1))} />
        <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => onPage(() => totalPages)} />
      </div>
    </div>
  );
}
