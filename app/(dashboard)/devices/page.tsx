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
  MapPin,
  QrCode,
  Eye,
  Trash2,
  Plus,
  ClipboardPlus,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
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
import { StatusBadge } from "@/components/devices/status-badge";
import { DeviceForm } from "@/components/devices/device-form";
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
import { DEVICE_STATUS, DEVICE_STATUS_ORDER, DEVICE_CATEGORIES } from "@/lib/constants";
import { can } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";

type ViewMode = "dashboard" | "table" | "detail" | "form" | "deck";
const VIEWS: { key: ViewMode; label: string; icon: any }[] = [
  { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { key: "table", label: "Bảng", icon: Table2 },
  { key: "detail", label: "Thẻ", icon: LayoutGrid },
  { key: "form", label: "Thêm mới", icon: FilePlus2 },
  { key: "deck", label: "Deck", icon: GalleryHorizontal },
];

export default function DevicesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const view = (params.get("view") as ViewMode) || "table";
  const statusFilter = params.get("status") || "ALL";

  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [category, setCategory] = React.useState("ALL");
  const [qrDevice, setQrDevice] = React.useState<DeviceListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceListItem | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useDevices({ q: debouncedQ, status: statusFilter, category });
  const del = useDeleteDevice();
  const devices = data?.data ?? [];
  const counts: Record<string, number> = data?.meta?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  function setView(v: ViewMode) {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    router.push(`/devices?${sp.toString()}`);
  }
  function setStatus(s: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("status", s);
    router.push(`/devices?${sp.toString()}`);
  }

  // `n` keyboard shortcut -> open form view
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setView("form");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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

  return (
    <div className="space-y-6">
      <PageHeader title="Quản lý thiết bị" description="Lý lịch & tình trạng tài sản thiết bị nhà máy">
        <ExportButton rows={devices.map((d) => ({ code: d.code, name: d.name, category: d.category, location: d.location, status: d.status }))} filename="thiet-bi" />
      </PageHeader>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickAction href="/devices?view=form" icon={Plus} label="Thêm thiết bị" />
        <QuickAction href="/repair-history" icon={ClipboardPlus} label="Ghi phiếu sửa chữa" />
        <QuickAction href="/hr/check-in" icon={UserCheck} label="Điểm danh ca" />
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {VIEWS.map((v) => {
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
        <DeviceForm onDone={() => setView("table")} />
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchBar value={q} onChange={setQ} placeholder="Tìm theo mã, tên, vị trí, serial... ( / )" className="lg:max-w-md" shortcut />
            <div className="flex flex-wrap gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 rounded-md border border-input bg-white px-3 text-sm"
              >
                <option value="ALL">Tất cả loại</option>
                {DEVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status filter chips */}
          <div className="flex flex-wrap gap-2">
            <Chip active={statusFilter === "ALL"} onClick={() => setStatus("ALL")} label="Tất cả" count={total} />
            {DEVICE_STATUS_ORDER.map((s) => (
              <Chip
                key={s}
                active={statusFilter === s}
                onClick={() => setStatus(s)}
                label={DEVICE_STATUS[s].label}
                count={counts[s] ?? 0}
                dot={DEVICE_STATUS[s].dot}
              />
            ))}
          </div>

          {isLoading ? (
            <TableSkeleton />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title="Không có thiết bị"
              description="Không tìm thấy thiết bị phù hợp. Thêm thiết bị mới để bắt đầu."
              action={{ label: "Thêm thiết bị", onClick: () => setView("form") }}
            />
          ) : view === "dashboard" ? (
            <DashboardView devices={devices} counts={counts} />
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

function Chip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-navy bg-navy text-white" : "border-border bg-white text-ink hover:border-accent"
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{count}</span>
    </button>
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
            <TableHead>Loại</TableHead>
            <TableHead>Vị trí</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Sửa chữa gần nhất</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs font-medium text-navy">{d.code}</TableCell>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell>{d.category}</TableCell>
              <TableCell className="text-muted-foreground">{d.location}</TableCell>
              <TableCell><StatusBadge status={d.status} /></TableCell>
              <TableCell className="text-muted-foreground">{lastRepair(d)}</TableCell>
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
            {d.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.imageUrl} alt={d.name} className="h-full w-full object-cover" />
            ) : (
              <Cpu className="h-10 w-10 text-navy/30" />
            )}
          </div>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-navy">{d.code}</span>
              <StatusBadge status={d.status} />
            </div>
            <h3 className="font-semibold leading-tight text-ink">{d.name}</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {d.location}
            </div>
            <div className="text-xs text-muted-foreground">
              {d.category} · {d._count.repairLogs} lần sửa · gần nhất {lastRepair(d)}
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
            <StatusBadge status={d.status} />
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Loại" value={d.category} />
              <Info label="Vị trí" value={d.location} />
              <Info label="Hãng" value={d.manufacturer ?? "—"} />
              <Info label="Model" value={d.model ?? "—"} />
              <Info label="Lắp đặt" value={formatDate(d.installDate)} />
              <Info label="Bảo hành" value={formatDate(d.warrantyUntil)} />
            </dl>
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

function DashboardView({ devices, counts }: { devices: DeviceListItem[]; counts: Record<string, number> }) {
  const statusData = DEVICE_STATUS_ORDER.map((s) => ({
    name: DEVICE_STATUS[s].label,
    value: counts[s] ?? 0,
    fill: DEVICE_STATUS[s].dot,
  })).filter((d) => d.value > 0);

  const byCategory = Object.entries(
    devices.reduce<Record<string, number>>((acc, d) => {
      acc[d.category] = (acc[d.category] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([category, count]) => ({ category, count }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Theo trạng thái</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {statusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Theo nhóm thiết bị</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
