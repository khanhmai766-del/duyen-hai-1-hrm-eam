"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Repeat, RefreshCw, Pencil, Trash2, Cpu, MapPin, History, CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
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
  useReplacementHistory,
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

type TabKey = "schedule" | "history";

/** "YYYY-MM" của một mốc thời gian, dùng để lọc theo tháng/năm. */
function ym(d: Date | string): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
function ymLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${mo}/${y}`;
}

export default function ReplacementsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = can(role, "manageReplacement");
  const canDelete = can(role, "approveRepair"); // ADMIN + SUPERVISOR
  const [tab, setTab] = React.useState<TabKey>("schedule");
  // Bộ lọc tháng/năm dùng chung cho cả 2 tab (mặc định tháng hiện tại).
  const [month, setMonth] = React.useState(() => ym(new Date()));

  /* ---- Tab 1: Lịch thay thế (schedule) ---- */
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
  const systemOf = (p: ReplacementItem) => p.system ?? p.material.system ?? null;
  const bySystem = system === "ALL" ? all : all.filter((p) => systemOf(p) === system);
  // Lọc theo tháng/năm: chỉ các điểm có NGÀY ĐẾN HẠN trong tháng đang chọn.
  const byMonth = bySystem.filter((p) => ym(p.nextDueAt) === month);
  const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
  for (const p of byMonth) counts[replacementDueStatus(p.nextDueAt)]++;
  const total = byMonth.length;
  const points = due === "ALL" ? byMonth : byMonth.filter((p) => replacementDueStatus(p.nextDueAt) === due);
  const isFiltered = debouncedQ.trim() !== "" || system !== "ALL" || due !== "ALL";

  const [editTarget, setEditTarget] = React.useState<ReplacementItem | null>(null);
  const [recordTarget, setRecordTarget] = React.useState<ReplacementItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<ReplacementItem | null>(null);

  /* ---- Tab 2: Lịch sử thay thế (history) ---- */
  const [historyQ, setHistoryQ] = React.useState("");
  const history = useReplacementHistory();
  const logs = history.data?.data ?? [];
  // Chỉ các lần ghi nhận trong tháng/năm đang chọn (theo NGÀY THAY).
  const logsInMonth = logs.filter((l) => ym(l.replacedAt) === month);
  const filteredLogs = historyQ.trim()
    ? logsInMonth.filter((l) => `${l.replacement?.material.code} ${l.replacement?.material.name} ${l.replacement?.location ?? ""} ${l.note ?? ""}`.toLowerCase().includes(historyQ.toLowerCase()))
    : logsInMonth;

  /* ---- Nút Xuất dùng chung: xuất theo tab đang mở ---- */
  const exportRows =
    tab === "schedule"
      ? points.map((p) => ({
          material: `${p.material.code} — ${p.material.name}`,
          target: p.device ? `${p.device.code} — ${p.device.name}` : p.location ?? "",
          system: systemOf(p) ?? "",
          interval: replacementIntervalLabel(p.intervalMonths, p.intervalNote),
          lastReplaced: formatDate(p.lastReplacedAt),
          nextDue: formatDate(p.nextDueAt),
          status: REPL_DUE[replacementDueStatus(p.nextDueAt)].label,
        }))
      : filteredLogs.map((l) => ({
          material: `${l.replacement?.material.code ?? ""} — ${l.replacement?.material.name ?? ""}`,
          location: l.replacement?.location ?? "",
          system: l.replacement?.system ?? l.replacement?.material.system ?? "",
          replacedAt: formatDate(l.replacedAt),
          quantity: l.quantity ?? "",
          note: l.note ?? "",
          doneBy: l.doneBy.name,
        }));
  const exportFilename = tab === "schedule" ? "lich-thay-the-vat-tu" : "lich-su-thay-the-vat-tu";

  return (
    <div className="space-y-6">
      <PageHeader title="Lịch thay thế vật tư" description="Tổng hợp lịch thay thế & lịch sử ghi nhận thay thế vật tư">
        <ExportButton rows={exportRows} filename={exportFilename} />
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabBtn active={tab === "schedule"} onClick={() => setTab("schedule")} icon={CalendarCheck} label="Lịch thay thế" />
        <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={History} label="Lịch sử thay thế" count={logs.length} />
      </div>

      {tab === "schedule" ? (
        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchBar value={q} onChange={setQ} placeholder="Tìm theo vật tư, vị trí..." className="sm:w-64" />
              <Select value={system} onValueChange={setSystem}>
                <SelectTrigger className="sm:w-48" aria-label="Lọc theo hệ thống"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả hệ thống</SelectItem>
                  {MATERIAL_SYSTEMS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MonthFilter value={month} onChange={setMonth} />
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
              title={`Không có điểm thay thế đến hạn trong tháng ${ymLabel(month)}`}
              description="Chọn tháng/năm khác ở bộ lọc để xem các điểm thay thế đến hạn ở tháng khác, hoặc bỏ bớt điều kiện lọc."
              action={isFiltered ? { label: "Xoá bộ lọc", onClick: () => { setQ(""); setDue("ALL"); setSystem("ALL"); } } : undefined}
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
                Tháng <span className="font-medium text-ink">{ymLabel(month)}</span> · <span className="font-semibold text-ink">{points.length}</span> điểm thay thế{system !== "ALL" && <> · hệ thống <span className="font-medium text-ink">{system}</span></>}
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
                      <TableCell className="text-center text-muted-foreground">{systemOf(p) ?? "—"}</TableCell>
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
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchBar value={historyQ} onChange={setHistoryQ} placeholder="Tìm theo vật tư, vị trí, ghi chú..." className="sm:w-72" />
            <MonthFilter value={month} onChange={setMonth} />
          </div>

          {history.isLoading ? (
            <TableSkeleton rows={8} />
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={History}
              title={`Không có ghi nhận thay thế trong tháng ${ymLabel(month)}`}
              description="Chọn tháng/năm khác ở bộ lọc để xem lịch sử các tháng trước."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
                Tháng <span className="font-medium text-ink">{ymLabel(month)}</span> · <span className="font-semibold text-ink">{filteredLogs.length}</span> lần ghi nhận thay thế
              </div>
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Vật tư</TableHead>
                    <TableHead>Vị trí thay thế</TableHead>
                    <TableHead className="text-center">Hệ thống</TableHead>
                    <TableHead className="text-center">Ngày thay</TableHead>
                    <TableHead className="text-center">Số lượng</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-center">Người thực hiện</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-ink">{l.replacement?.material.name ?? "—"}</div>
                        <div className="font-mono text-xs text-navy">{l.replacement?.material.code ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.replacement?.location ?? "—"}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{l.replacement?.system ?? l.replacement?.material.system ?? "—"}</TableCell>
                      <TableCell className="text-center text-sm text-ink">{formatDate(l.replacedAt)}</TableCell>
                      <TableCell className="text-center text-sm">{l.quantity != null ? `${l.quantity} ${l.replacement?.material.unit ?? ""}` : "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground" title={l.note ?? undefined}>{l.note || "—"}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{l.doneBy.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Schedule dialogs */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Sửa điểm thay thế</DialogTitle></DialogHeader>
          {editTarget && <ReplacementPointForm materialId={editTarget.materialId} point={editTarget} defaultSystem={editTarget.material.system} lockedLocation={editTarget.location} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      <RecordReplacementDialog point={recordTarget} onClose={() => setRecordTarget(null)} />

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

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: any; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-navy text-navy" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count != null && count > 0 && (
        <span className={cn("rounded-full px-1.5 text-xs font-bold", active ? "bg-navy/10 text-navy" : "bg-muted text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}

/** Bộ lọc tháng/năm: nút lùi/tiến + ô chọn tháng (native month picker). */
function MonthFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function shift(delta: number) {
    const [y, m] = value.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => shift(-1)} aria-label="Tháng trước">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="month"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Chọn tháng/năm"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      />
      <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => shift(1)} aria-label="Tháng sau">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
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
