"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";
import {
  LayoutGrid,
  Table2,
  LayoutDashboard,
  FilePlus2,
  GalleryHorizontal,
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
import { useEquipmentTree } from "@/hooks/useEquipment";
import { can } from "@/lib/constants";
import { buildEquipmentTreeIndex, compareEquipmentSeq } from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";
import { formatDate, cn } from "@/lib/utils";
import { Bar3DDefs, barFill } from "@/components/shared/bar-3d";

type ViewMode = "tree" | "dashboard" | "table" | "detail" | "form" | "deck";
const VIEWS: { key: ViewMode; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { key: "tree", label: "Cây thiết bị", icon: Network },
  { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { key: "table", label: "Bảng", icon: Table2 },
  { key: "detail", label: "Thẻ", icon: LayoutGrid },
  { key: "form", label: "Thêm mới", icon: FilePlus2, adminOnly: true },
  { key: "deck", label: "Deck", icon: GalleryHorizontal },
];

type SystemTreeRow = {
  seq: string;
  name: string;
  parentName: string;
  drawing: string | null;
  isGroup: boolean;
  childCount: number;
  deviceId: string | null;
};

export default function DevicesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
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
    setQ(urlQ);
    setDebouncedQ(urlQ);
    setSystemSeq(urlSystemSeq);
  }, [urlQ, urlSystemSeq]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useDevices({ q: debouncedQ, systemSeq: systemSeq === "ALL" ? undefined : systemSeq });
  const { data: equipmentTreeData, isLoading: equipmentTreeLoading } = useEquipmentTree();
  const del = useDeleteDevice();
  const devices = data?.data ?? [];
  const equipmentNodes = React.useMemo(() => equipmentTreeData?.data ?? [], [equipmentTreeData]);
  const equipmentIndex = React.useMemo(() => buildEquipmentTreeIndex(equipmentNodes), [equipmentNodes]);
  const systemOptions = React.useMemo(() => {
    const { roots } = equipmentIndex;
    return [...roots].sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
  }, [equipmentIndex]);
  const selectedSystemNode = systemSeq === "ALL" ? null : equipmentIndex.bySeq.get(systemSeq) ?? null;
  const systemTreeRows = React.useMemo(() => {
    if (!selectedSystemNode) return [];
    const qText = normalizeText(debouncedQ.trim());
    const rows: SystemTreeRow[] = [];
    const queue = [...(equipmentIndex.childrenOf.get(selectedSystemNode.seq) ?? [])];
    while (queue.length) {
      const node = queue.shift()!;
      const childCount = (equipmentIndex.childrenOf.get(node.seq) ?? []).length;
      const parentSeq = equipmentIndex.parentOf.get(node.seq);
      const parent = parentSeq ? equipmentIndex.bySeq.get(parentSeq) ?? null : null;
      const row = {
        seq: node.seq,
        name: node.name,
        parentName: parent?.name ?? "",
        drawing: node.drawing,
        isGroup: childCount > 0,
        childCount,
        deviceId: node.deviceId ?? null,
      };
      const haystack = normalizeText([row.seq, row.name, row.parentName, row.drawing].filter(Boolean).join(" "));
      if (!qText || haystack.includes(qText)) rows.push(row);
      queue.push(...(equipmentIndex.childrenOf.get(node.seq) ?? []));
    }
    return rows.sort((a, b) => compareEquipmentSeq(a.seq, b.seq));
  }, [debouncedQ, equipmentIndex, selectedSystemNode]);
  const systemLeafRows = React.useMemo(() => systemTreeRows.filter((row) => !row.isGroup), [systemTreeRows]);

  function setView(v: ViewMode) {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    router.push(`/devices?${sp.toString()}`);
  }

  // `n` keyboard shortcut -> open form view (admin only)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" && isAdmin && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setView("form");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isAdmin]);

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

  const visibleViews = VIEWS.filter((v) => !v.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      <PageHeader title="THÔNG TIN THIẾT BỊ" description="Lý lịch & quản lý tài sản thiết bị nhà máy">
        <ExportButton rows={devices.map((d) => ({ code: d.code, name: d.name, system: d.system ?? "", managingPosition: d.managingPosition ?? "" }))} filename="thiet-bi" />
        {isAdmin && (
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
        {view !== "form" && (
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
        isAdmin ? (
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
            <p className="text-sm text-muted-foreground">Chỉ Quản trị viên mới được thêm thiết bị mới.</p>
          </CardContent></Card>
        )
      ) : (
        <>
          {view === "table" && selectedSystemNode ? (
            equipmentTreeLoading ? (
              <TableSkeleton />
            ) : (
              <SystemTreeTableView rows={systemTreeRows} selectedSystemName={selectedSystemNode.name} />
            )
          ) : (view === "detail" || view === "deck") && selectedSystemNode ? (
            equipmentTreeLoading ? (
              <TableSkeleton />
            ) : view === "detail" ? (
              <SystemLeafCardView rows={systemLeafRows} selectedSystemName={selectedSystemNode.name} />
            ) : (
              <SystemLeafDeckView rows={systemLeafRows} selectedSystemName={selectedSystemNode.name} />
            )
          ) : isLoading ? (
            <TableSkeleton />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="Không có thiết bị"
              description="Không tìm thấy thiết bị phù hợp."
              action={isAdmin ? { label: "Thêm thiết bị", onClick: () => setView("form") } : undefined}
            />
          ) : view === "dashboard" ? (
            <DashboardView devices={devices} />
          ) : view === "table" ? (
            <TableView
              devices={devices}
              canDelete={can(session?.user?.role, "deleteDevice")}
              onQr={setQrDevice}
              onDelete={setDeleteTarget}
            />
          ) : view === "detail" ? (
            <DetailView devices={devices} onQr={setQrDevice} />
          ) : (
            <DeckView devices={devices} onQr={setQrDevice} />
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
  const path = row.deviceId ? `/devices/${row.deviceId}` : `/devices?view=tree&focusSeq=${encodeURIComponent(row.seq)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function SystemLeafCardView({ rows, selectedSystemName }: { rows: SystemTreeRow[]; selectedSystemName: string }) {
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
        {rows.map((row) => (
          <Card key={row.seq} className="overflow-hidden transition-shadow hover:shadow-md">
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
                  <div className="mt-2 line-clamp-2 text-xs text-muted-foreground" title={row.parentName}>
                    {row.parentName || "Thư mục con cuối cùng"}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <InfoPill label="Bản vẽ" value={row.drawing || "—"} />
                <InfoPill label="Loại" value={row.deviceId ? "Có lý lịch" : "Node cây"} />
              </div>
              <div className="mt-4 flex gap-2">
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
    </div>
  );
}

function SystemLeafDeckView({ rows, selectedSystemName }: { rows: SystemTreeRow[]; selectedSystemName: string }) {
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
          <div className="text-xs text-muted-foreground">Deck QR theo thiết bị ở thư mục con cuối cùng</div>
        </div>
        <span className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white">{rows.length} thẻ QR</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {rows.map((row) => (
          <Card key={row.seq} className="w-[360px] shrink-0 overflow-hidden">
            <CardHeader className="border-b border-border bg-gradient-to-br from-navy/5 to-sky-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-bold text-navy">{row.seq}</div>
                  <CardTitle className="mt-1 line-clamp-2 text-base leading-tight">{row.name}</CardTitle>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm">QR</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="flex justify-center rounded-xl border border-dashed border-border bg-white p-4">
                <QRCodeSVG value={systemRowQrValue(row)} size={154} includeMargin />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Thư mục" value={row.parentName || "—"} />
                <Info label="Bản vẽ" value={row.drawing || "—"} />
              </dl>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/devices?view=tree&focusSeq=${encodeURIComponent(row.seq)}`}>Xem trong cây</Link>
                </Button>
                {row.deviceId && (
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/devices/${row.deviceId}`}>Lý lịch</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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
function DetailView({ devices, onQr }: { devices: DeviceListItem[]; onQr: (d: DeviceListItem) => void }) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [&>*]:mb-4">
      {devices.map((d) => (
        <Card key={d.id} className="break-inside-avoid overflow-hidden transition-shadow hover:shadow-md">
          <div className="flex h-32 items-center justify-center bg-gradient-to-br from-navy/5 to-accent/5">
            {d.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.images[0]} alt={d.name} className="h-full w-full object-cover" />
            ) : (
              <Cpu className="h-10 w-10 text-navy/30" />
            )}
          </div>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-navy">{d.code}</span>
              {d.system && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{d.system}</span>}
            </div>
            <h3 className="font-semibold leading-tight text-ink">{d.name}</h3>
            {d.managingPosition && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserCog className="h-3 w-3" /> {d.managingPosition}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {d._count.repairLogs} lần sửa · gần nhất {lastRepair(d)}
            </div>
            <div className="flex gap-2 pt-1">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/devices/${d.id}`}>Chi tiết</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onQr(d)}>
                <QrCode className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeckView({ devices, onQr }: { devices: DeviceListItem[]; onQr: (d: DeviceListItem) => void }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {devices.map((d) => (
        <Card key={d.id} className="w-[340px] shrink-0">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <span className="font-mono text-xs font-semibold text-navy">{d.code}</span>
              <CardTitle className="text-base">{d.name}</CardTitle>
            </div>
            {d.system && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{d.system}</span>}
          </CardHeader>
          <CardContent className="space-y-3">
            {d.images?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.images[0]} alt={d.name} className="h-36 w-full rounded-lg border border-border object-cover" />
            )}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Hệ thống" value={d.system ?? "—"} />
              <Info label="Cương vị quản lý" value={d.managingPosition ?? "—"} />
            </dl>
            {d.attachedInfo && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="text-xs font-medium uppercase text-muted-foreground">Thông tin đính kèm</div>
                <div className="mt-1 line-clamp-3 text-ink">{d.attachedInfo}</div>
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="text-xs font-medium uppercase text-muted-foreground">Lịch sử sửa chữa</div>
              <div className="mt-1 text-ink">
                {d._count.repairLogs} phiếu · gần nhất {lastRepair(d)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" className="flex-1">
                <Link href={`/devices/${d.id}`}>Xem chi tiết</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => onQr(d)}>
                <QrCode className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function DashboardView({ devices }: { devices: DeviceListItem[] }) {
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
  const byPosition = groupCount((d) => d.managingPosition).slice(0, 10);
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
