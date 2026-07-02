"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import { EquipmentCardEditDialog } from "@/components/devices/equipment-card-edit-dialog";
import {
  LayoutGrid,
  LayoutDashboard,
  FilePlus2,
  Cpu,
  Folder,
  QrCode,
  Eye,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  ShieldAlert,
  UserCog,
  Network,
  Wrench,
  Package,
  type LucideIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeviceForm } from "@/components/devices/device-form";
import { EquipmentTreeView } from "@/components/devices/equipment-tree";
import { ImportDialog } from "@/components/devices/import-dialog";
import { QRModal } from "@/components/devices/qr-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDevices, useDeleteDevice, type DeviceListItem } from "@/hooks/useDevices";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { normalizeText } from "@/lib/nav";
import { formatDate, cn } from "@/lib/utils";
import { Bar3DDefs, barFill } from "@/components/shared/bar-3d";

type ViewMode = "tree" | "dashboard" | "table" | "detail" | "form";
const VIEWS: { key: ViewMode; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { key: "tree", label: "Cây thiết bị", icon: Network },
  { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { key: "detail", label: "Thẻ", icon: LayoutGrid },
  { key: "form", label: "Thêm mới", icon: FilePlus2, adminOnly: true },
];

type SystemTreeRow = {
  seq: string;
  parentSeq: string | null;
  name: string;
  parentName: string;
  drawing: string | null;
  isGroup: boolean;
  childCount: number;
  deviceId: string | null;
  duplicateSeqs?: string[];
  duplicateCount?: number;
};

export default function DevicesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const canManageDevices = rbac.can("device-manage", ["create", "manage", "full"]);
  const canImportDevices = rbac.can("device-manage", ["manage", "full"]);
  const canDeleteDevices = rbac.can("device-delete", ["full"]);
  const view = (params.get("view") as ViewMode) || "tree";
  const urlQ = params.get("q") ?? "";
  const urlSystemSeq = params.get("systemSeq") ?? "ALL";

  const [q, setQ] = React.useState(urlQ);
  const [debouncedQ, setDebouncedQ] = React.useState(urlQ);
  const [systemSeq, setSystemSeq] = React.useState(urlSystemSeq);
  const [qrDevice, setQrDevice] = React.useState<DeviceListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceListItem | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  React.useEffect(() => {
    if (view !== "table") return;
    const sp = new URLSearchParams(params.toString());
    sp.set("view", "dashboard");
    router.replace(`/devices?${sp.toString()}`);
  }, [params, router, view]);

  React.useEffect(() => {
    setQ(urlQ);
    setDebouncedQ(urlQ);
    setSystemSeq(urlSystemSeq);
  }, [urlQ, urlSystemSeq]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const shouldLoadDevices = view === "dashboard" || view === "detail" || view === "table";
  const { data, isLoading } = useDevices({
    q: debouncedQ,
    systemSeq: systemSeq === "ALL" ? undefined : systemSeq,
    enabled: shouldLoadDevices,
  });
  const del = useDeleteDevice();
  const devices = data?.data ?? [];
  const deviceMeta = data?.meta;
  const systemOptions = deviceMeta?.rootSystems ?? [];
  const selectedSystemNode = null as { seq: string; name: string } | null;
  const byPosition = deviceMeta?.byPosition ?? [];
  const equipmentTreeLoading = false;
  const systemDisplayRows: SystemTreeRow[] = [];
  const systemLeafRows: SystemTreeRow[] = [];
  // Tập seq người dùng được Xem (gồm tổ tiên để vẫn thấy đường dẫn). null = không giới hạn (admin/cương vị chưa cấu hình).
  // Lọc danh sách thẻ/lý lịch theo quyền Xem của cương vị (giống cây thiết bị).

  function setView(v: ViewMode) {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    router.push(`/devices?${sp.toString()}`);
  }

  // `n` keyboard shortcut -> open form view (admin only)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" && canManageDevices && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setView("form");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, canManageDevices]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success(`Đã xoá thiết bị ${deleteTarget.code}`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const visibleViews = VIEWS.filter((v) => v.key !== "table" && (!v.adminOnly || canManageDevices));

  return (
    <div className="space-y-6">
      <PageHeader title="THÔNG TIN THIẾT BỊ" description="Lý lịch & quản lý tài sản thiết bị nhà máy">
        {shouldLoadDevices && (
          <ExportButton rows={devices.map((d) => ({ code: d.code, name: d.name, system: d.system ?? "", managingPosition: d.managingPosition ?? "" }))} filename="thiet-bi" />
        )}
        {canImportDevices && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" /> Nhập CSV/Excel
          </Button>
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
        {shouldLoadDevices && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:ml-auto">
            <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, hệ thống..." className="sm:w-72" shortcut />
            <select
              value={systemSeq}
              onChange={(e) => setSystemSeq(e.target.value)}
              className="h-10 shrink-0 rounded-md border border-input bg-white px-3 text-sm"
            >
              <option value="ALL">Tất cả hệ thống</option>
              {systemOptions.map((node) => (
                <option key={node.seq} value={node.seq}>{node.seq} · {node.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {view === "tree" ? (
        <EquipmentTreeView />
      ) : view === "form" ? (
        canManageDevices ? (
          <DeviceForm
            onDone={(device) => {
              const sp = new URLSearchParams(params.toString());
              sp.set("view", "tree");
              sp.set("focusSeq", device.code);
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
      ) : (
        <>
          {(view as ViewMode) === "table" ? (
            equipmentTreeLoading ? (
              <TableSkeleton />
            ) : (
              <SystemTreeTableView rows={systemDisplayRows} selectedSystemName={selectedSystemNode?.name ?? "Tất cả hệ thống"} />
            )
          ) : (view as ViewMode) === "detail" && selectedSystemNode ? (
            equipmentTreeLoading ? (
              <TableSkeleton />
            ) : (
              <SystemLeafCardView rows={systemLeafRows} selectedSystemName={selectedSystemNode.name} />
            )
          ) : isLoading ? (
            <TableSkeleton />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="Không có thiết bị"
              description="Không tìm thấy thiết bị phù hợp."
              action={canManageDevices ? { label: "Thêm thiết bị", onClick: () => setView("form") } : undefined}
            />
          ) : (view as ViewMode) === "dashboard" ? (
            <DashboardView devices={devices} byPosition={byPosition} />
          ) : (
            <DetailView
              devices={devices}
              canDelete={canDeleteDevices}
              onQr={setQrDevice}
              onDelete={setDeleteTarget}
            />
          )}
        </>
      )}

      {qrDevice && (
        <QRModal open={!!qrDevice} onOpenChange={(o) => !o && setQrDevice(null)} device={qrDevice} />
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Xoá thiết bị?"
        description={`Bạn chắc chắn muốn xoá "${deleteTarget?.name}"? Mọi lịch sử sửa chữa liên quan cũng sẽ bị xoá.`}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function lastRepair(d: DeviceListItem) {
  return d.repairLogs?.[0]?.startedAt ? formatDate(d.repairLogs[0].startedAt) : "—";
}

function systemRowQrValue(row: SystemTreeRow) {
  const path = row.deviceId ? `/public/devices/${row.deviceId}` : `/public/equipment/${encodeURIComponent(row.seq)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function SystemLeafCardView({ rows, selectedSystemName }: { rows: SystemTreeRow[]; selectedSystemName: string }) {
  const [editSeq, setEditSeq] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(24);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const firstShown = rows.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, rows.length);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    setPage(1);
  }, [rows, pageSize]);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="Không có thiết bị"
        description="Không tìm thấy thiết bị ở thư mục con cuối cùng của hệ thống đã chọn."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-ink">{selectedSystemName}</div>
          <div className="text-xs text-muted-foreground">Hiển thị {rows.length} thiết bị ở thư mục con cuối cùng để tra mã QR</div>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{rows.length} thiết bị</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {pagedRows.map((row) => (
          <Card
            key={row.seq}
            onClick={() => setEditSeq(row.seq)}
            title="Bấm để chỉnh sửa thẻ thiết bị"
            className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md hover:ring-1 hover:ring-accent/40"
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2 shadow-sm">
                  <QRCodeSVG value={systemRowQrValue(row)} size={76} includeMargin={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-bold text-navy">{row.seq}</div>
                  <h3 className="mt-1 line-clamp-2 font-semibold leading-tight text-ink" title={row.name}>
                    {row.name}
                  </h3>
                  {(row.duplicateCount ?? 1) > 1 && (
                    <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Gộp {row.duplicateCount} mã trùng
                    </div>
                  )}
                  <div className="mt-2 line-clamp-2 text-xs text-muted-foreground" title={row.parentName}>
                    {row.parentName || "Thư mục con cuối cùng"}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <InfoPill label="Bản vẽ" value={row.drawing || "—"} />
                <InfoPill label="Loại" value={row.deviceId ? "Có lý lịch" : "Node cây"} />
              </div>
              <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/devices?view=tree&focusSeq=${encodeURIComponent(row.seq)}`}>
                    <Network className="h-4 w-4" /> Trong cây
                  </Link>
                </Button>
                {row.deviceId && (
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/devices/${row.deviceId}`}>
                      <Eye className="h-4 w-4" /> Lý lịch
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <CardGridPagination
        firstShown={firstShown}
        lastShown={lastShown}
        total={rows.length}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageSize={setPageSize}
        onPage={setPage}
      />
      <EquipmentCardEditDialog seq={editSeq} onOpenChange={(o) => !o && setEditSeq(null)} />
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium text-ink" title={value}>{value}</div>
    </div>
  );
}

function SystemTreeTableView({ rows, selectedSystemName }: { rows: SystemTreeRow[]; selectedSystemName: string }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const firstShown = rows.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, rows.length);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [rows, pageSize]);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-ink">{selectedSystemName}</div>
        <div className="text-xs text-muted-foreground">Danh sách thư mục và thiết bị thuộc hệ thống đã chọn</div>
      </div>
      {rows.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <Cpu className="h-9 w-9 text-muted-foreground/40" />
          Không có dữ liệu phù hợp trong hệ thống này.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px] text-center">Số thứ tự</TableHead>
                  <TableHead className="min-w-[260px] text-center">Tên thư mục / thiết bị</TableHead>
                  <TableHead className="min-w-[220px] text-center">Thuộc thư mục</TableHead>
                  <TableHead className="w-[180px] text-center">Bản vẽ liên quan</TableHead>
                  <TableHead className="w-[130px] text-center">Phân loại</TableHead>
                  <TableHead className="w-[110px] text-center">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((row) => (
                  <TableRow key={row.seq}>
                    <TableCell className="text-center font-mono text-xs font-semibold text-navy">{row.seq}</TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        {row.isGroup ? (
                          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                        ) : (
                          <Cpu className="h-4 w-4 shrink-0 text-sky-500" />
                        )}
                        <span className="truncate font-medium text-ink" title={row.name}>{row.name}</span>
                        {(row.duplicateCount ?? 1) > 1 && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Gộp {row.duplicateCount}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <span className="line-clamp-2" title={row.parentName}>{row.parentName || "—"}</span>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{row.drawing || "—"}</TableCell>
                    <TableCell className="text-center">
                      {row.isGroup ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Nhóm · {row.childCount}
                        </span>
                      ) : (
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Thiết bị</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button asChild variant="ghost" size="icon" title="Xem trong cây">
                          <Link href={`/devices?view=tree&focusSeq=${encodeURIComponent(row.seq)}`}>
                            <Network className="h-4 w-4" />
                          </Link>
                        </Button>
                        {row.deviceId && (
                          <Button asChild variant="ghost" size="icon" title="Lý lịch thiết bị">
                            <Link href={`/devices/${row.deviceId}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>Hiển thị {firstShown}-{lastShown} trong tổng số {rows.length} dòng</div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink shadow-none"
                aria-label="Số dòng hiển thị"
              >
                {[20, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>dòng</span>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} />
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">{page}/{totalPages}</span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function TableView({
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
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const positionOptions = React.useMemo(
    () =>
      Array.from(new Set(devices.map((device) => device.managingPosition).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "vi")
      ),
    [devices]
  );
  const filteredDevices = React.useMemo(
    () => (positionFilter === "ALL" ? devices : devices.filter((device) => device.managingPosition === positionFilter)),
    [devices, positionFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize));
  const firstShown = filteredDevices.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, filteredDevices.length);
  const pagedDevices = filteredDevices.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [filteredDevices, pageSize]);

  React.useEffect(() => {
    if (positionFilter !== "ALL" && !positionOptions.includes(positionFilter)) {
      setPositionFilter("ALL");
    }
  }, [positionFilter, positionOptions]);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">Mã</TableHead>
              <TableHead className="text-center">Tên thiết bị</TableHead>
              <TableHead className="text-center">Hệ thống</TableHead>
              <TableHead className="w-[170px] text-center">
                <div className="inline-flex h-8 items-center justify-center gap-1">
                  <span className="whitespace-nowrap">Cương vị quản lý</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700",
                          positionFilter !== "ALL" && "border-blue-200 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100"
                        )}
                        title="Lọc theo cương vị quản lý"
                        aria-label="Lọc theo cương vị quản lý"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Cương vị quản lý</DropdownMenuLabel>
                      <DropdownMenuItem
                        className={cn("justify-between text-sm", positionFilter === "ALL" && "bg-blue-50 text-blue-700")}
                        onClick={() => setPositionFilter("ALL")}
                      >
                        <span>Tất cả cương vị</span>
                        {positionFilter === "ALL" && <span className="text-xs font-bold">✓</span>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="max-h-64 overflow-y-auto">
                        {positionOptions.map((position) => (
                          <DropdownMenuItem
                            key={position}
                            className={cn("justify-between gap-3 text-sm", positionFilter === position && "bg-blue-50 text-blue-700")}
                            onClick={() => setPositionFilter(position)}
                          >
                            <span className="truncate">{position}</span>
                            {positionFilter === position && <span className="text-xs font-bold">✓</span>}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableHead>
              <TableHead className="text-center">Hình ảnh</TableHead>
              <TableHead className="text-center">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedDevices.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-center font-mono text-xs font-medium text-navy">{d.code}</TableCell>
                <TableCell className="text-center font-medium">{d.name}</TableCell>
                <TableCell className="text-center text-muted-foreground">{d.system ?? "—"}</TableCell>
                <TableCell className="text-center text-muted-foreground">{d.managingPosition ?? "—"}</TableCell>
                <TableCell>
                  {d.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.images[0]} alt={d.name} className="mx-auto h-10 w-10 rounded-md border border-border object-cover" />
                  ) : (
                    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground"><Cpu className="h-4 w-4" /></span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button asChild variant="ghost" size="icon" title="Chi tiết">
                      <Link href={`/devices/${d.id}`}><Eye className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" title="Mã QR" onClick={() => onQr(d)}>
                      <QrCode className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" title="Xoá" onClick={() => onDelete(d)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          Hiển thị {firstShown}-{lastShown} trong tổng số {filteredDevices.length} bản ghi
          {positionFilter !== "ALL" && (
            <span className="ml-2 inline-flex max-w-[160px] align-middle rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              <span className="truncate">{positionFilter}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink shadow-none"
            aria-label="Số dòng hiển thị"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>dòng</span>
          <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
          <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} />
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">
            {page}/{totalPages}
          </span>
          <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} />
          <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
        </div>
      </div>
    </Card>
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
  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    setPage(1);
  }, [devices, pageSize]);

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="Không có thẻ thiết bị"
        description="Không tìm thấy thiết bị ở thư mục con cuối cùng theo điều kiện lọc hiện tại."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-ink">THẺ THÔNG TIN THIẾT BỊ</div>
          <div className="text-xs text-muted-foreground">
            Tổng hợp {devices.length} thiết bị ở thư mục con cuối cùng, liên kết trực tiếp QR, sửa chữa và vật tư.
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
        {pagedDevices.map((d) => (
          <Card
            key={d.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/devices/${encodeURIComponent(d.id)}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") router.push(`/devices/${encodeURIComponent(d.id)}`);
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
                  <QRCodeSVG value={d.qrCodeData || `/public/equipment/${encodeURIComponent(d.code)}`} size={82} includeMargin={false} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/repair-history/${encodeURIComponent(d.id)}`}
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
                  <Link href={`/devices/${encodeURIComponent(d.id)}`}>
                    <Eye className="h-4 w-4" /> Xem lý lịch
                  </Link>
                </Button>
                {canDelete && (
                  <Button size="sm" variant="outline" title="Xóa thiết bị" onClick={() => onDelete(d)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
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

function DashboardView({ devices, byPosition }: { devices: DeviceListItem[]; byPosition: Array<{ name: string; count: number }> }) {

  const groupCount = (key: (d: DeviceListItem) => string | null | undefined) =>
    Object.entries(
      devices.reduce<Record<string, number>>((acc, d) => {
        const k = key(d) || "(Chưa đặt)";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {})
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  const bySystem = groupCount((d) => d.system).slice(0, 10);

  // Số thiết bị mỗi cương vị "phải quản lý": lấy theo phân quyền hệ thống trực tiếp (scope quyền Sửa).
  /*
  const legacyByPosition = React.useMemo(() => {
    const index = buildEquipmentTreeIndex(equipmentNodes);
    const { parentOf } = index;
    const editPosBySeq = new Map<string, string[]>();
    for (const scope of scopes) {
      if (scope.access === "edit") {
        const arr = editPosBySeq.get(scope.systemSeq) ?? [];
        arr.push(scope.position);
        editPosBySeq.set(scope.systemSeq, arr);
      }
    }
    const counts = new Map<string, number>();
    for (const d of devices) {
      const managing = new Set<string>();
      // Cương vị có quyền Sửa hệ thống chứa thiết bị (kế thừa theo nhánh cha).
      let cur: string | null | undefined = d.code;
      while (cur) {
        for (const pos of editPosBySeq.get(cur) ?? []) managing.add(pos);
        cur = parentOf.get(cur) ?? null;
      }
      for (const pos of managing) counts.set(pos, (counts.get(pos) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [devices, scopes, equipmentNodes]);
  */
  const repairHotlist = [...devices]
    .filter((d) => d._count.repairLogs > 0)
    .sort((a, b) => b._count.repairLogs - a._count.repairLogs)
    .slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-accent" /> Phân bổ theo hệ thống
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-1">
            <div className="chart-3d h-[300px] min-w-[560px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySystem} barCategoryGap="24%" margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  {Bar3DDefs({ colors: ["#2563EB"] })}
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={58} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
                  <Tooltip />
                  <Bar dataKey="count" name="Thiết bị" fill={barFill("#2563EB")} radius={[5, 5, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-warning" /> Thiết bị sửa chữa nhiều
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {repairHotlist.length === 0 ? (
            <div className="flex h-[236px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
              <Wrench className="h-8 w-8 text-muted-foreground/40" />
              Chưa có lịch sử sửa chữa trong danh sách này.
            </div>
          ) : (
            repairHotlist.map((d, index) => (
              <Link
                key={d.id}
                href={`/devices/${d.id}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-accent/50 hover:bg-accent/5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-xs font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{d.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{d.code}</span>
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {d._count.repairLogs} phiếu
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
      <Card className="xl:col-span-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-success" /> Theo cương vị quản lý
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-1">
            <div className="chart-3d h-[320px] min-w-[620px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPosition} layout="vertical" margin={{ top: 8, right: 16, left: 42, bottom: 8 }}>
                  {Bar3DDefs({ colors: ["#16A34A"] })}
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Thiết bị" fill={barFill("#16A34A")} radius={[0, 5, 5, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
