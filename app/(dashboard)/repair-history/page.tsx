"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Wrench, Pencil, Trash2, CheckCircle2, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RepairStatusBadge, PriorityBadge } from "@/components/devices/status-badge";
import { RepairForm } from "@/components/repair/repair-form";
import { ProgressTracker } from "@/components/repair/progress-tracker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRepairLogs, useDeleteRepair, useUpdateRepair, type RepairFilters } from "@/hooks/useRepair";
import { useUsers } from "@/hooks/useUsers";
import { REPAIR_STATUS, REPAIR_STATUS_ORDER, PRIORITY_ORDER, PRIORITY, can } from "@/lib/constants";
import { formatDate, formatDateTime, formatCurrency, formatDuration, cn } from "@/lib/utils";
import type { RepairLogWithRelations } from "@/types";

export default function RepairHistoryPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const [filters, setFilters] = React.useState<RepairFilters>({});
  const { data, isLoading } = useRepairLogs(filters);
  const { data: usersData } = useUsers();
  const del = useDeleteRepair();
  const logs = data?.data ?? [];

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<RepairLogWithRelations | null>(null);
  const [drawer, setDrawer] = React.useState<RepairLogWithRelations | null>(null);
  const [delTarget, setDelTarget] = React.useState<RepairLogWithRelations | null>(null);

  function setFilter<K extends keyof RepairFilters>(k: K, v: string) {
    setFilters((f) => ({ ...f, [k]: v === "ALL" ? undefined : v }));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Lịch sử sửa chữa" description="Toàn bộ phiếu sửa chữa & bảo trì thiết bị">
        <ExportButton
          rows={logs.map((l) => ({
            device: l.device.code,
            title: l.title,
            status: REPAIR_STATUS[l.status as keyof typeof REPAIR_STATUS]?.label,
            priority: PRIORITY[l.priority as keyof typeof PRIORITY]?.label,
            technician: l.createdBy.name,
            startedAt: formatDate(l.startedAt),
            cost: l.cost ?? "",
          }))}
          filename="lich-su-sua-chua"
        />
        {can(role, "createRepair") && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Tạo phiếu</Button>
        )}
      </PageHeader>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <FilterSelect label="Trạng thái" value={filters.status ?? "ALL"} onChange={(v) => setFilter("status", v)}
            options={[["ALL", "Tất cả"], ...REPAIR_STATUS_ORDER.map((s) => [s, REPAIR_STATUS[s].label] as [string, string])]} />
          <FilterSelect label="Ưu tiên" value={filters.priority ?? "ALL"} onChange={(v) => setFilter("priority", v)}
            options={[["ALL", "Tất cả"], ...PRIORITY_ORDER.map((p) => [p, PRIORITY[p].label] as [string, string])]} />
          <FilterSelect label="Kỹ thuật viên" value={filters.technicianId ?? "ALL"} onChange={(v) => setFilter("technicianId", v)}
            options={[["ALL", "Tất cả"], ...(usersData?.data ?? []).map((u) => [u.id, u.name] as [string, string])]} />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Từ ngày</label>
            <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Đến ngày</label>
            <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : logs.length === 0 ? (
        <EmptyState icon={Wrench} title="Chưa có phiếu sửa chữa"
          description="Tạo phiếu sửa chữa đầu tiên để theo dõi bảo trì thiết bị."
          action={can(role, "createRepair") ? { label: "Tạo phiếu", onClick: () => setCreateOpen(true) } : undefined} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thiết bị</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead>Ưu tiên</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>KTV</TableHead>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Chi phí</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => setDrawer(l)}>
                  <TableCell className="font-mono text-xs font-medium text-navy">{l.device.code}</TableCell>
                  <TableCell className="max-w-[260px] truncate font-medium">{l.title}</TableCell>
                  <TableCell><PriorityBadge priority={l.priority} /></TableCell>
                  <TableCell><RepairStatusBadge status={l.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.createdBy.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(l.startedAt)}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(l.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Tạo phiếu sửa chữa</DialogTitle></DialogHeader>
          <RepairForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Chỉnh sửa phiếu</DialogTitle></DialogHeader>
          {editTarget && <RepairForm repair={editTarget} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Slide-over drawer */}
      <RepairDrawer
        log={drawer}
        onClose={() => setDrawer(null)}
        role={role}
        userId={session?.user?.id}
        onEdit={(l) => { setDrawer(null); setEditTarget(l); }}
        onDelete={(l) => { setDrawer(null); setDelTarget(l); }}
      />

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá phiếu sửa chữa?"
        description={`Xoá phiếu "${delTarget?.title}"?`}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá phiếu");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function RepairDrawer({
  log, onClose, role, userId, onEdit, onDelete,
}: {
  log: RepairLogWithRelations | null;
  onClose: () => void;
  role?: string;
  userId?: string;
  onEdit: (l: RepairLogWithRelations) => void;
  onDelete: (l: RepairLogWithRelations) => void;
}) {
  const update = useUpdateRepair();
  if (!log) return null;
  const canEdit = role === "ADMIN" || role === "SUPERVISOR" || (role === "TECHNICIAN" && log.createdBy.id === userId);
  const canDelete = role === "ADMIN" || log.createdBy.id === userId;
  const canApprove = can(role, "approveRepair");

  async function approve() {
    try {
      await update.mutateAsync({ id: log!.id, approve: true, status: "CLOSED" });
      toast.success("Đã duyệt phiếu");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-border bg-white shadow-xl animate-in slide-in-from-right">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-bold text-ink">Chi tiết phiếu sửa chữa</h2>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <div className="flex items-center gap-2">
              <PriorityBadge priority={log.priority} />
              <RepairStatusBadge status={log.status} />
            </div>
            <h3 className="mt-2 text-lg font-semibold text-ink">{log.title}</h3>
            <Link href={`/devices/${log.device.id}`} className="font-mono text-sm text-accent hover:underline">
              {log.device.code} — {log.device.name}
            </Link>
          </div>

          <div className="rounded-lg border border-border p-4">
            <ProgressTracker status={log.status} />
          </div>

          <DetailBlock label="Hiện tượng" value={log.symptom} />
          <DetailBlock label="Nguyên nhân" value={log.cause} />
          <DetailBlock label="Hành động xử lý" value={log.action} />
          <DetailBlock label="Kết quả" value={log.result} />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Meta label="Bắt đầu" value={formatDateTime(log.startedAt)} />
            <Meta label="Hoàn thành" value={formatDateTime(log.completedAt)} />
            <Meta label="Thời gian dừng" value={formatDuration(log.downtime)} />
            <Meta label="Chi phí" value={formatCurrency(log.cost)} />
            <Meta label="Người tạo" value={log.createdBy.name} />
            <Meta label="Người duyệt" value={log.approvedBy?.name ?? "Chưa duyệt"} />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {canApprove && !log.approvedBy && (
              <Button onClick={approve} variant="accent" size="sm" disabled={update.isPending}>
                <CheckCircle2 className="h-4 w-4" /> Duyệt phiếu
              </Button>
            )}
            {canEdit && <Button onClick={() => onEdit(log)} variant="outline" size="sm"><Pencil className="h-4 w-4" /> Sửa</Button>}
            {canDelete && <Button onClick={() => onDelete(log)} variant="outline" size="sm"><Trash2 className="h-4 w-4 text-destructive" /> Xoá</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}
