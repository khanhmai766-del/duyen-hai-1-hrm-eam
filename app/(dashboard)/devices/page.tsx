"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutGrid,
  Table2,
  LayoutDashboard,
  FilePlus2,
  GalleryHorizontal,
  Cpu,
  QrCode,
  Eye,
  Trash2,
  Plus,
  ClipboardPlus,
  ArrowRight,
  FileSpreadsheet,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeviceForm } from "@/components/devices/device-form";
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
import { useDevices, useDeleteDevice, type DeviceListItem } from "@/hooks/useDevices";
import { can } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";

type ViewMode = "dashboard" | "table" | "detail" | "form" | "deck";
const VIEWS: { key: ViewMode; label: string; icon: any; adminOnly?: boolean }[] = [
  { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { key: "table", label: "Bảng", icon: Table2 },
  { key: "detail", label: "Thẻ", icon: LayoutGrid },
  { key: "form", label: "Thêm mới", icon: FilePlus2, adminOnly: true },
  { key: "deck", label: "Deck", icon: GalleryHorizontal },
];

export default function DevicesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const view = (params.get("view") as ViewMode) || "table";

  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [system, setSystem] = React.useState("ALL");
  const [qrDevice, setQrDevice] = React.useState<DeviceListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceListItem | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useDevices({ q: debouncedQ, system: system === "ALL" ? undefined : system });
  const del = useDeleteDevice();
  const devices = data?.data ?? [];
  const systems: string[] = (data?.meta?.systems as string[]) ?? [];

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
      <PageHeader title="Quản lý thiết bị" description="Lý lịch & quản lý tài sản thiết bị nhà máy">
        <ExportButton rows={devices.map((d) => ({ code: d.code, name: d.name, system: d.system ?? "", managingPosition: d.managingPosition ?? "" }))} filename="thiet-bi" />
        {isAdmin && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" /> Nhập CSV/Excel
          </Button>
        )}
      </PageHeader>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {isAdmin && <QuickAction href="/devices?view=form" icon={Plus} label="Thêm thiết bị" />}
        <QuickAction href="/repair-history" icon={ClipboardPlus} label="Lịch sử sửa chữa" />
        <QuickAction href="/defects" icon={ShieldAlert} label="Khiếm khuyết thiết bị" />
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
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

      {view === "form" ? (
        isAdmin ? (
          <DeviceForm onDone={() => setView("table")} />
        ) : (
          <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <p className="font-medium text-ink">Bạn không có quyền thêm thiết bị</p>
            <p className="text-sm text-muted-foreground">Chỉ Quản trị viên mới được thêm thiết bị mới.</p>
          </CardContent></Card>
        )
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, hệ thống, cương vị... ( / )" className="lg:max-w-md" shortcut />
            <div className="flex flex-wrap gap-2">
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                className="h-10 rounded-md border border-input bg-white px-3 text-sm"
              >
                <option value="ALL">Tất cả hệ thống</option>
                {systems.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
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

function QuickAction({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent/5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      {label}
      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function lastRepair(d: DeviceListItem) {
  return d.repairLogs?.[0]?.startedAt ? formatDate(d.repairLogs[0].startedAt) : "—";
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
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Tên thiết bị</TableHead>
            <TableHead>Hệ thống</TableHead>
            <TableHead>Cương vị quản lý</TableHead>
            <TableHead>Hình ảnh</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs font-medium text-navy">{d.code}</TableCell>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-muted-foreground">{d.system ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{d.managingPosition ?? "—"}</TableCell>
              <TableCell>
                {d.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.images[0]} alt={d.name} className="h-10 w-10 rounded-md border border-border object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground"><Cpu className="h-4 w-4" /></span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
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
    </Card>
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
    ).map(([name, count]) => ({ name, count }));

  const bySystem = groupCount((d) => d.system);
  const byPosition = groupCount((d) => d.managingPosition);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Theo hệ thống</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySystem}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Theo cương vị quản lý</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPosition} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#16A34A" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
