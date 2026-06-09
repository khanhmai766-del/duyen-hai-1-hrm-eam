"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ShieldAlert, Wrench, CircleSlash, CircleDashed, Package, Plus, X, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ExportButton } from "@/components/shared/export-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DefectForm } from "@/components/defects/defect-form";
import { useDefects, useDeleteDefect, type DefectItem } from "@/hooks/useDefects";
import { DEFECT_STATUS, DEFECT_SEVERITY, can } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";

export default function DefectsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = can(role, "manageDefect");
  const canDelete = can(role, "approveRepair"); // ADMIN + SUPERVISOR

  const { data, isLoading } = useDefects();
  const del = useDeleteDefect();
  const defects = data?.data ?? [];

  const chuaXuLy = defects.filter((d) => d.status === "CHUA_XU_LY").length;
  const coPct = defects.filter((d) => d.status === "CO_PCT").length;
  const choVatTu = defects.filter((d) => d.status === "CHO_VAT_TU").length;
  const tonDong = defects.filter((d) => d.status !== "DA_XU_LY").length;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<DefectItem | null>(null);

  function openCreate() { setEditTarget(null); setFormOpen(true); }
  function openEdit(d: DefectItem) { setEditTarget(d); setFormOpen(true); }

  return (
    <div className="space-y-6">
      <PageHeader title="Khiếm khuyết thiết bị" description="Theo dõi sự cố & khiếm khuyết thiết bị đang tồn đọng">
        <ExportButton
          rows={defects.map((d) => ({
            id: d.code,
            unit: d.unit,
            cuongVi: d.system ?? "",
            severity: d.severity ? DEFECT_SEVERITY[d.severity as keyof typeof DEFECT_SEVERITY] : "",
            requestType: d.requestType ?? "",
            content: d.content ?? "",
            status: DEFECT_STATUS[d.status as keyof typeof DEFECT_STATUS]?.label ?? d.status,
            detectedAt: formatDate(d.detectedAt),
          }))}
          filename="khiem-khuyet-thiet-bi"
        />
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm mới
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Chưa thực hiện" value={chuaXuLy} icon={CircleDashed} tint="red" />
        <StatCard label="Đang thực hiện" value={coPct} icon={Wrench} tint="blue" />
        <StatCard label="Chờ vật tư" value={choVatTu} icon={Package} tint="amber" />
        <StatCard label="Khiếm khuyết tồn đọng" value={tonDong} icon={CircleSlash} tint="navy" />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : defects.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Chưa có khiếm khuyết"
          description="Nhấn “Thêm mới” để ghi nhận khiếm khuyết thiết bị."
          action={canManage ? { label: "Thêm mới", onClick: openCreate } : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Mã</TableHead>
                <TableHead className="text-center">Tổ máy</TableHead>
                <TableHead>Cương vị</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead className="text-center">Mức độ</TableHead>
                <TableHead className="text-center">Tình trạng</TableHead>
                <TableHead className="text-center">Phát hiện</TableHead>
                <TableHead className="text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defects.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {d.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.imageUrl} alt={d.code} className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><ShieldAlert className="h-4 w-4" /></span>
                      )}
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-medium text-navy">{d.code}</div>
                        {d.requestType && <div className="text-[11px] text-muted-foreground">{d.requestType}{d.requestNumber ? ` · ${d.requestNumber}` : ""}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm font-medium text-ink">{d.unit}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.system ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-sm" title={d.content ?? undefined}>{d.content || "—"}</TableCell>
                  <TableCell className="text-center">
                    {d.severity ? (
                      <span title={DEFECT_SEVERITY[d.severity as keyof typeof DEFECT_SEVERITY]} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-ink">{d.severity}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center"><DefectStatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDate(d.detectedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {canManage && (
                        <Button variant="ghost" size="icon" title="Sửa" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDelTarget(d)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Panel nhập khiếm khuyết (trượt từ phải) */}
      {formOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setFormOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-xl animate-in slide-in-from-right">
            <div className="flex items-center gap-2 border-b border-border p-4">
              <button onClick={() => setFormOpen(false)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Đóng"><X className="h-5 w-5" /></button>
              <h2 className="text-lg font-bold text-ink">{editTarget ? `Sửa khiếm khuyết · ${editTarget.code}` : "Nhập khiếm khuyết"}</h2>
            </div>
            <DefectForm
              defect={editTarget}
              onDone={() => setFormOpen(false)}
              onCancel={() => setFormOpen(false)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá khiếm khuyết?"
        description={delTarget ? `Xoá khiếm khuyết “${delTarget.code}”? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá khiếm khuyết");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function DefectStatusBadge({ status }: { status: string }) {
  const meta = DEFECT_STATUS[status as keyof typeof DEFECT_STATUS];
  if (!meta) return <span className="text-xs">{status}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}
