"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { X, Pencil, Trash2, RefreshCw, Cpu, CalendarClock, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReplacementBadge } from "@/components/materials/replacement-badge";
import { ReplacementPointForm } from "@/components/materials/replacement-point-form";
import { RecordReplacementDialog } from "@/components/materials/record-replacement-dialog";
import {
  useReplacements,
  useDeleteReplacement,
  type ReplacementItem,
} from "@/hooks/useReplacements";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { replacementIntervalLabel } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export function ReplacementDrawer({
  material,
  role,
  onClose,
}: {
  material: { id: string; code: string; name: string; system?: string | null } | null;
  role?: string;
  onClose: () => void;
}) {
  const rbac = useRbacAccess();
  const canManage = rbac.can("replacement-manage", ["create", "manage", "full"]);
  const { data, isLoading } = useReplacements(material ? { materialId: material.id } : {});
  // Điểm theo dõi là bản ghi RIÊNG (tạo từ nút "Thêm điểm"); xoá ở đây chỉ xoá điểm
  // theo dõi này — dòng khai báo thiết bị trong Danh mục vật tư là bản ghi khác, vẫn còn.
  const del = useDeleteReplacement();
  const points = data?.data ?? [];
  const counts = (data?.meta?.counts as { OVERDUE: number; DUE_SOON: number; OK: number }) ?? { OVERDUE: 0, DUE_SOON: 0, OK: 0 };

  const [editTarget, setEditTarget] = React.useState<ReplacementItem | null>(null);
  const [recordTarget, setRecordTarget] = React.useState<ReplacementItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<ReplacementItem | null>(null);

  if (!material) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-border bg-white shadow-xl animate-in slide-in-from-right">
        <div className="flex items-start justify-between border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-accent">
              <Repeat className="h-4 w-4" />
              <h2 className="font-bold text-ink">Theo dõi thay thế vật tư</h2>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{material.code} — {material.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Stat label="Quá hạn" value={counts.OVERDUE} tone="text-red-700 bg-red-50" />
            <Stat label="Sắp đến hạn" value={counts.DUE_SOON} tone="text-amber-700 bg-amber-50" />
            <Stat label="Còn hạn" value={counts.OK} tone="text-green-700 bg-green-50" />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : points.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Chưa có điểm thay thế nào cho vật tư này.</p>
            </div>
          ) : (
            points.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Cpu className="h-3.5 w-3.5 text-navy" />
                      {p.device ? (
                        <Link href={`/devices/${p.device.id}`} className="hover:underline">{p.device.code} — {p.device.name}</Link>
                      ) : (
                        <span className="truncate">Chưa chọn thiết bị</span>
                      )}
                      {p.unit && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                          style={unitBadgeStyle(p.unit)}
                        >
                          {p.unit}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> {replacementIntervalLabel(p.intervalMonths, p.intervalNote)}</span>
                      {p.location && <span>Thiết bị: {p.location}</span>}
                      <span>Lần gần nhất: {formatDate(p.lastReplacedAt)}</span>
                      <span>Đến hạn: {formatDate(p.nextDueAt)}</span>
                    </div>
                  </div>
                  <ReplacementBadge nextDueAt={p.nextDueAt} withText />
                </div>

                {p.note && <p className="mt-2 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">{p.note}</p>}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {canManage && (
                    <Button size="sm" variant="accent" onClick={() => setRecordTarget(p)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Ghi nhận thay
                    </Button>
                  )}
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setEditTarget(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  )}
                  {canManage && (
                    <Button size="sm" variant="ghost" title="Xoá mốc theo dõi (không xoá dữ liệu thiết bị)" className="text-destructive hover:bg-red-50" onClick={() => setDelTarget(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Sửa điểm thay thế</DialogTitle></DialogHeader>
          {editTarget && <ReplacementPointForm materialId={material.id} point={editTarget} defaultSystem={material.system ?? null} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Record replacement */}
      <RecordReplacementDialog point={recordTarget} onClose={() => setRecordTarget(null)} />

      {/* Delete */}
      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá điểm theo dõi thay thế?"
        description="Xoá điểm theo dõi này khỏi Lịch thay thế vật tư. Dữ liệu thiết bị đã khai báo trong Danh mục vật tư vẫn giữ nguyên — có thể bấm “Thêm điểm” để theo dõi lại khi cần."
        confirmLabel="Xoá theo dõi"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá điểm theo dõi — dữ liệu thiết bị vẫn giữ nguyên");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

// Màu badge tổ máy: S1 giữ navy như cũ; S2 tím cánh sen; COMMON nâu hạt dẻ.
function unitBadgeStyle(unit: string): React.CSSProperties {
  if (unit === "S2") return { background: "rgba(192,38,211,0.13)", color: "#a21caf" };
  if (unit === "COMMON") return { background: "rgba(149,69,53,0.15)", color: "#8a4030" };
  return { background: "rgba(30,58,95,0.10)", color: "#1E3A5F" };
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${tone}`}>
      {value} {label}
    </span>
  );
}
