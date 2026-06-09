"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Repeat, AlertTriangle, Clock3, ShieldCheck, RefreshCw, History, Pencil, Trash2, Cpu, MapPin } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReplacementBadge } from "@/components/materials/replacement-badge";
import { ReplacementPointForm } from "@/components/materials/replacement-point-form";
import { RecordReplacementDialog } from "@/components/materials/record-replacement-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useReplacements,
  useReplacement,
  useDeleteReplacement,
  type ReplacementItem,
} from "@/hooks/useReplacements";
import {
  REPL_DUE,
  REPL_DUE_ORDER,
  replacementDueStatus,
  replacementIntervalLabel,
  MATERIAL_SYSTEMS,
  can,
} from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";

export default function ReplacementsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = can(role, "manageReplacement");
  const canDelete = can(role, "approveRepair"); // ADMIN + SUPERVISOR

  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [due, setDue] = React.useState("ALL");
  const [system, setSystem] = React.useState("ALL");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useReplacements({ q: debouncedQ });
  const del = useDeleteReplacement();
  const all = data?.data ?? [];

  // Lọc theo hệ thống (client) trước, rồi tính số đếm theo trạng thái.
  const bySystem = system === "ALL" ? all : all.filter((p) => p.material.system === system);
  const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
  for (const p of bySystem) counts[replacementDueStatus(p.nextDueAt)]++;
  const total = bySystem.length;
  const points = due === "ALL" ? bySystem : bySystem.filter((p) => replacementDueStatus(p.nextDueAt) === due);

  const [editTarget, setEditTarget] = React.useState<ReplacementItem | null>(null);
  const [recordTarget, setRecordTarget] = React.useState<ReplacementItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<ReplacementItem | null>(null);
  const [historyTarget, setHistoryTarget] = React.useState<ReplacementItem | null>(null);

  const isFiltered = debouncedQ.trim() !== "" || system !== "ALL" || due !== "ALL";

  return (
    <div className="space-y-6">
      <PageHeader title="Lịch thay thế vật tư" description="Tổng hợp toàn bộ điểm thay thế & cảnh báo đến hạn của mọi vật tư">
        <ExportButton
          rows={points.map((p) => ({
            material: `${p.material.code} — ${p.material.name}`,
            target: p.device ? `${p.device.code} — ${p.device.name}` : p.location ?? "",
            system: p.material.system ?? "",
            interval: replacementIntervalLabel(p.intervalMonths, p.intervalNote),
            lastReplaced: formatDate(p.lastReplacedAt),
            nextDue: formatDate(p.nextDueAt),
            status: REPL_DUE[replacementDueStatus(p.nextDueAt)].label,
          }))}
          filename="lich-thay-the-vat-tu"
        />
      </PageHeader>

      {/* KPI summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={AlertTriangle} label="Quá hạn" value={counts.OVERDUE} active={due === "OVERDUE"} onClick={() => setDue(due === "OVERDUE" ? "ALL" : "OVERDUE")} tone="red" />
        <KpiCard icon={Clock3} label="Sắp đến hạn" value={counts.DUE_SOON} active={due === "DUE_SOON"} onClick={() => setDue(due === "DUE_SOON" ? "ALL" : "DUE_SOON")} tone="amber" />
        <KpiCard icon={ShieldCheck} label="Còn hạn" value={counts.OK} active={due === "OK"} onClick={() => setDue(due === "OK" ? "ALL" : "OK")} tone="green" />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar value={q} onChange={setQ} placeholder="Tìm theo vật tư, thiết bị, vị trí..." className="sm:w-72" />
          <Select value={system} onValueChange={setSystem}>
            <SelectTrigger className="sm:w-56" aria-label="Lọc theo hệ thống"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả hệ thống</SelectItem>
              {MATERIAL_SYSTEMS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={due === "ALL"} onClick={() => setDue("ALL")} label="Tất cả" count={total} />
          {REPL_DUE_ORDER.map((k) => (
            <Chip key={k} active={due === k} onClick={() => setDue(k)} label={REPL_DUE[k].label} count={counts[k]} dot={REPL_DUE[k].dot} />
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : points.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={isFiltered ? "Không có điểm thay thế phù hợp" : "Chưa có điểm thay thế"}
          description={
            isFiltered
              ? "Không có điểm thay thế nào khớp bộ lọc. Thử bỏ bớt điều kiện."
              : "Thêm điểm thay thế cho vật tư trong trang Quản lý vật tư (nút ↻ Theo dõi thay thế)."
          }
          action={isFiltered ? { label: "Xoá bộ lọc", onClick: () => { setQ(""); setDue("ALL"); setSystem("ALL"); } } : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
            Hiển thị <span className="font-semibold text-ink">{points.length}</span> điểm thay thế{system !== "ALL" && <> · hệ thống <span className="font-medium text-ink">{system}</span></>}
          </div>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Vật tư</TableHead>
                <TableHead>Áp dụng cho</TableHead>
                <TableHead className="text-center">Hệ thống</TableHead>
                <TableHead className="text-center">Chu kỳ</TableHead>
                <TableHead className="text-center">Lần gần nhất</TableHead>
                <TableHead className="text-center">Đến hạn</TableHead>
                <TableHead className="text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.material.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.material.imageUrl} alt={p.material.name} className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Repeat className="h-4 w-4" /></span>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{p.material.name}</div>
                        <div className="font-mono text-xs text-navy">{p.material.code}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {p.device ? <Cpu className="h-3.5 w-3.5 text-navy" /> : <MapPin className="h-3.5 w-3.5 text-accent" />}
                      {p.device ? (
                        <Link href={`/devices/${p.device.id}`} className="hover:underline">{p.device.code} — {p.device.name}</Link>
                      ) : (
                        <span>{p.location}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{p.material.system ?? "—"}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{replacementIntervalLabel(p.intervalMonths, p.intervalNote)}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{formatDate(p.lastReplacedAt)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm text-ink">{formatDate(p.nextDueAt)}</span>
                      <ReplacementBadge nextDueAt={p.nextDueAt} withText />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {canManage && (
                        <Button variant="ghost" size="icon" title="Ghi nhận thay" className="text-accent hover:bg-accent/10" onClick={() => setRecordTarget(p)}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Lịch sử" onClick={() => setHistoryTarget(p)}>
                        <History className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" title="Sửa" onClick={() => setEditTarget(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" title="Xoá" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDelTarget(p)}>
                          <Trash2 className="h-4 w-4" />
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

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Sửa điểm thay thế</DialogTitle></DialogHeader>
          {editTarget && <ReplacementPointForm materialId={editTarget.materialId} point={editTarget} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      {/* Record */}
      <RecordReplacementDialog point={recordTarget} onClose={() => setRecordTarget(null)} />

      {/* History */}
      <HistoryDialog point={historyTarget} onClose={() => setHistoryTarget(null)} />

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá điểm thay thế?"
        description="Xoá điểm thay thế này và toàn bộ lịch sử thay thế của nó?"
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá điểm thay thế");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function HistoryDialog({ point, onClose }: { point: ReplacementItem | null; onClose: () => void }) {
  const { data, isLoading } = useReplacement(point?.id);
  const logs = data?.data?.logs ?? [];
  const target = point?.device ? `${point.device.code} — ${point.device.name}` : point?.location ?? "—";
  return (
    <Dialog open={!!point} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lịch sử thay thế</DialogTitle></DialogHeader>
        {point && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium text-ink">{point.material.code} — {point.material.name}</div>
              <div className="text-xs text-muted-foreground">Áp dụng: {target}</div>
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải…</p>
            ) : logs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Chưa có lịch sử thay thế.</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-2.5 text-sm">
                    <div>
                      <div className="font-medium text-ink">{formatDate(l.replacedAt)}</div>
                      {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {l.quantity != null && <div>SL: {l.quantity}</div>}
                      <div>{l.doneBy.name}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const TONES = {
  red: "text-red-600 bg-red-50",
  amber: "text-amber-600 bg-amber-50",
  green: "text-green-600 bg-green-50",
} as const;

function KpiCard({ icon: Icon, label, value, active, onClick, tone }: { icon: any; label: string; value: number; active: boolean; onClick: () => void; tone: keyof typeof TONES }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-4 rounded-xl border bg-white p-4 text-left transition-all hover:shadow-md", active ? "border-navy ring-1 ring-navy" : "border-border")}>
      <span className={cn("flex h-12 w-12 items-center justify-center rounded-xl", TONES[tone])}><Icon className="h-6 w-6" /></span>
      <div>
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}

function Chip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors", active ? "border-navy bg-navy text-white" : "border-border bg-white text-ink hover:border-accent")}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{count}</span>
    </button>
  );
}
