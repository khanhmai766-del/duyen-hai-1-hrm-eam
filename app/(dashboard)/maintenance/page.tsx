"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CalendarClock, Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, Clock3, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PriorityBadge } from "@/components/devices/status-badge";
import { DueBadge } from "@/components/maintenance/due-badge";
import { PlanForm } from "@/components/maintenance/plan-form";
import { CompleteDialog } from "@/components/maintenance/complete-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useMaintenancePlans,
  useDeletePlan,
  type MaintenancePlanItem,
  type MaintenanceFilters,
} from "@/hooks/useMaintenance";
import { PM_DUE, PM_DUE_ORDER, intervalLabel, pmDueStatus, can } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";

export default function MaintenancePage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = can(role, "manageMaintenance");

  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [due, setDue] = React.useState<string>("ALL");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters: MaintenanceFilters = { q: debouncedQ, due };
  const { data, isLoading } = useMaintenancePlans(filters);
  const del = useDeletePlan();
  const plans = data?.data ?? [];
  const counts: Record<string, number> = (data?.meta?.counts as Record<string, number>) ?? {};
  const total = (counts.OVERDUE ?? 0) + (counts.DUE_SOON ?? 0) + (counts.OK ?? 0);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<MaintenancePlanItem | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<MaintenancePlanItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<MaintenancePlanItem | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Bảo trì định kỳ" description="Kế hoạch bảo dưỡng theo chu kỳ & cảnh báo đến hạn">
        <ExportButton
          rows={plans.map((p) => ({
            device: p.device.code,
            title: p.title,
            interval: intervalLabel(p.intervalDays),
            assignee: p.assignee?.name ?? "",
            lastDone: formatDate(p.lastDoneAt),
            nextDue: formatDate(p.nextDueAt),
            status: PM_DUE[pmDueStatus(p.nextDueAt)].label,
          }))}
          filename="bao-tri-dinh-ky"
        />
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Tạo kế hoạch</Button>
        )}
      </PageHeader>

      {/* KPI summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={AlertTriangle}
          label="Quá hạn"
          value={counts.OVERDUE ?? 0}
          active={due === "OVERDUE"}
          onClick={() => setDue(due === "OVERDUE" ? "ALL" : "OVERDUE")}
          tone="red"
        />
        <KpiCard
          icon={Clock3}
          label="Sắp đến hạn"
          value={counts.DUE_SOON ?? 0}
          active={due === "DUE_SOON"}
          onClick={() => setDue(due === "DUE_SOON" ? "ALL" : "DUE_SOON")}
          tone="amber"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Đúng kế hoạch"
          value={counts.OK ?? 0}
          active={due === "OK"}
          onClick={() => setDue(due === "OK" ? "ALL" : "OK")}
          tone="green"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBar value={q} onChange={setQ} placeholder="Tìm theo công việc, mã/tên thiết bị..." className="lg:max-w-md" />
        <div className="flex flex-wrap gap-2">
          <Chip active={due === "ALL"} onClick={() => setDue("ALL")} label="Tất cả" count={total} />
          {PM_DUE_ORDER.map((k) => (
            <Chip key={k} active={due === k} onClick={() => setDue(k)} label={PM_DUE[k].label} count={counts[k] ?? 0} dot={PM_DUE[k].dot} />
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Chưa có kế hoạch bảo trì"
          description="Tạo kế hoạch bảo trì định kỳ để theo dõi lịch bảo dưỡng thiết bị và nhận cảnh báo khi đến hạn."
          action={canManage ? { label: "Tạo kế hoạch", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thiết bị</TableHead>
                <TableHead>Công việc</TableHead>
                <TableHead>Chu kỳ</TableHead>
                <TableHead>Phụ trách</TableHead>
                <TableHead>Lần gần nhất</TableHead>
                <TableHead>Đến hạn</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/devices/${p.device.id}`} className="font-mono text-xs font-medium text-navy hover:underline">
                      {p.device.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.title}</span>
                      <PriorityBadge priority={p.priority} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{intervalLabel(p.intervalDays)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.assignee?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(p.lastDoneAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-ink">{formatDate(p.nextDueAt)}</span>
                      <DueBadge nextDueAt={p.nextDueAt} withText />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <Button variant="ghost" size="icon" title="Đánh dấu đã làm" onClick={() => setCompleteTarget(p)}>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="icon" title="Sửa" onClick={() => setEditTarget(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can(role, "approveRepair") && (
                        <Button variant="ghost" size="icon" title="Xoá" onClick={() => setDelTarget(p)}>
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
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Tạo kế hoạch bảo trì</DialogTitle></DialogHeader>
          <PlanForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Chỉnh sửa kế hoạch</DialogTitle></DialogHeader>
          {editTarget && <PlanForm plan={editTarget} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Complete */}
      <CompleteDialog plan={completeTarget} onClose={() => setCompleteTarget(null)} />

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá kế hoạch bảo trì?"
        description={`Xoá kế hoạch "${delTarget?.title}" và toàn bộ lịch sử thực hiện?`}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá kế hoạch");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

const TONES = {
  red: "text-red-600 bg-red-50",
  amber: "text-amber-600 bg-amber-50",
  green: "text-green-600 bg-green-50",
} as const;

function KpiCard({
  icon: Icon,
  label,
  value,
  active,
  onClick,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: keyof typeof TONES;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 rounded-xl border bg-white p-4 text-left transition-all hover:shadow-md",
        active ? "border-navy ring-1 ring-navy" : "border-border"
      )}
    >
      <span className={cn("flex h-12 w-12 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </button>
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
