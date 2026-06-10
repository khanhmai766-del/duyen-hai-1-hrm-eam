"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck, Trash2, X, Plus, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ExportButton } from "@/components/shared/export-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DefectHistoryDialog } from "@/components/repair/defect-history-dialog";
import { useDefectHistory, useDeleteDefectHistory, type DefectHistoryFilters, type DefectHistoryItem } from "@/hooks/useDefectHistory";
import { usePositions } from "@/hooks/useUsers";
import { DEFECT_UNITS, can } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export function DefectHistoryTab({ role }: { role?: string }) {
  const canManage = can(role, "manageDefect"); // ADMIN + SUPERVISOR + TECHNICIAN
  const canDelete = can(role, "approveRepair"); // ADMIN + SUPERVISOR
  const positions = usePositions();
  const [filters, setFilters] = React.useState<DefectHistoryFilters>({});
  const { data, isLoading } = useDefectHistory(filters);
  const del = useDeleteDefectHistory();
  const rows = data?.data ?? [];

  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [delTarget, setDelTarget] = React.useState<DefectHistoryItem | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DefectHistoryItem | null>(null);

  function setFilter<K extends keyof DefectHistoryFilters>(k: K, v: string) {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Lịch sử sửa chữa" description="Lịch sử khiếm khuyết thiết bị đã xử lý theo cương vị">
        <ExportButton
          rows={rows.map((r) => ({
            workOrderNumber: r.workOrderNumber ?? "",
            performedAt: formatDate(r.performedAt),
            unit: r.unit,
            cuongVi: r.system ?? "",
            requestNumber: r.requestNumber ?? "",
            content: r.content ?? "",
            result: r.result ?? "",
            doneBy: r.createdBy?.name ?? "",
          }))}
          filename="lich-su-khiem-khuyet"
        />
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Thêm mới</Button>
        )}
      </PageHeader>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Cương vị</label>
            <select
              value={filters.system ?? ""}
              onChange={(e) => setFilter("system", e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tổ máy</label>
            <select
              value={filters.unit ?? ""}
              onChange={(e) => setFilter("unit", e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {DEFECT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Từ ngày</label>
            <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Đến ngày</label>
            <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Chưa có lịch sử khiếm khuyết"
          description="Khi một khiếm khuyết được bấm “Hoàn thành”, bản ghi sẽ xuất hiện ở đây."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Số phiếu công tác</TableHead>
                <TableHead className="text-center">Ngày thực hiện</TableHead>
                <TableHead className="text-center">Tổ máy</TableHead>
                <TableHead>Cương vị</TableHead>
                <TableHead>Kết quả thực hiện</TableHead>
                <TableHead className="text-center">Ảnh</TableHead>
                {(canManage || canDelete) && <TableHead className="text-center">Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-ink">{r.workOrderNumber || "—"}</div>
                    {r.requestType && <div className="text-[11px] text-muted-foreground">PCT: {r.requestType}</div>}
                    {r.requestNumber && <div className="text-[11px] text-muted-foreground">YC: {r.requestNumber}</div>}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDate(r.performedAt)}</TableCell>
                  <TableCell className="text-center text-sm font-medium text-ink">{r.unit}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.system ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] text-sm">
                    <div className="truncate" title={r.result ?? undefined}>{r.result || "—"}</div>
                    {r.content && <div className="truncate text-[11px] text-muted-foreground" title={r.content}>{r.content}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {r.images.length === 0 ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        r.images.map((src, i) => (
                          <button key={i} type="button" onClick={() => setLightbox(src)} className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`Ảnh ${i + 1}`} className="h-9 w-9 rounded-md border border-border object-cover transition-transform hover:scale-105" />
                          </button>
                        ))
                      )}
                    </div>
                  </TableCell>
                  {(canManage || canDelete) && (
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {canManage && (
                          <Button variant="ghost" size="icon" title="Sửa" onClick={() => setEditTarget(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDelTarget(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <DefectHistoryDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DefectHistoryDialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)} record={editTarget} />

      {/* Lightbox xem ảnh lớn */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && (
            <div className="relative">
              <button onClick={() => setLightbox(null)} className="absolute right-2 top-2 rounded-full bg-ink/70 p-1 text-white hover:bg-ink" aria-label="Đóng">
                <X className="h-4 w-4" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightbox} alt="Ảnh khiếm khuyết" className="max-h-[80vh] w-full rounded-md object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá bản ghi lịch sử?"
        description="Xoá bản ghi lịch sử khiếm khuyết này? Hành động không thể hoàn tác."
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá bản ghi");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
