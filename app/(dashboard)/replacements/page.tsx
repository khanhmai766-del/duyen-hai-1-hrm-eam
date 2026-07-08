"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Repeat, RefreshCw, Pencil, Trash2, Cpu, History, CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/shared/export-button";
import { SearchBar } from "@/components/shared/search-bar";
import { AnnualBackupExport } from "@/components/shared/annual-backup-export";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { PeakProtectedRoute } from "@/components/shared/peak-protected-route";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReplacementBadge } from "@/components/materials/replacement-badge";
import { ReplacementCalendar, dayKey } from "@/components/materials/replacement-calendar";
import { ReplacementPointForm } from "@/components/materials/replacement-point-form";
import { RecordReplacementDialog } from "@/components/materials/record-replacement-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useReplacements,
  useReplacementHistory,
  useDeleteReplacement,
  useDeleteReplacementLog,
  useUpdateReplacementLog,
  type ReplacementItem,
  type ReplacementDevice,
  type ReplacementLogItem,
} from "@/hooks/useReplacements";
import {
  REPL_DUE,
  REPL_DUE_ORDER,
  addMonths,
  replacementDueStatus,
  replacementIntervalLabel,
} from "@/lib/constants";
import { formatDate, formatDateInput, cn, initials } from "@/lib/utils";
import { useRbacAccess } from "@/hooks/useRbacAccess";

type TabKey = "schedule" | "history";

// Bộ lọc tổ máy: theo tab Danh mục vật tư mà vật tư thuộc về (Material.machine).
const MACHINE_FILTERS = [
  { key: "ALL", label: "Tất cả tổ máy" },
  { key: "S1", label: "Tổ máy S1" },
  { key: "S2", label: "Tổ máy S2" },
  { key: "COMMON", label: "COMMON" },
] as const;

// Mốc thời gian xuất danh sách vật tư cần thay thế (tính từ hôm nay).
const EXPORT_HORIZONS = [
  { months: 1, label: "1 tháng" },
  { months: 2, label: "2 tháng" },
  { months: 3, label: "3 tháng" },
  { months: 6, label: "6 tháng" },
  { months: 12, label: "1 năm" },
] as const;

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
  return (
    <PeakProtectedRoute>
      <ReplacementsPageContent />
    </PeakProtectedRoute>
  );
}

function ReplacementsPageContent() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const rbac = useRbacAccess();
  const canManage = rbac.can("replacement-manage", ["create", "manage", "full"]);
  const canDelete = rbac.can("replacement-manage", ["full"]);
  const [tab, setTab] = React.useState<TabKey>("schedule");
  // Bộ lọc tháng/năm dùng chung cho cả 2 tab (mặc định tháng hiện tại).
  const [month, setMonth] = React.useState(() => ym(new Date()));

  /* ---- Tab 1: Lịch thay thế (schedule) ---- */
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [due, setDue] = React.useState("ALL");
  const [machineFilter, setMachineFilter] = React.useState("ALL");
  // Ngày đang chọn trên lịch ("YYYY-MM-DD") — lọc panel danh sách bên phải.
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useReplacements({ q: debouncedQ });
  const del = useDeleteReplacement();
  const delLog = useDeleteReplacementLog();
  const all = data?.data ?? [];
  const linkedDeviceOf = (p: { device: ReplacementDevice | null; material: { deviceMaterials?: Array<{ device: ReplacementDevice }> } }) =>
    p.device ?? p.material.deviceMaterials?.[0]?.device ?? null;
  // Lọc theo tổ máy của vật tư (vật tư nằm ở tab S1/S2/COMMON nào trong Danh mục).
  const byMachine = machineFilter === "ALL" ? all : all.filter((p) => (p.material.machine ?? "COMMON") === machineFilter);
  // Lọc theo tháng/năm: chỉ các điểm có NGÀY ĐẾN HẠN trong tháng đang chọn.
  const byMonth = byMachine.filter((p) => ym(p.nextDueAt) === month);
  const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
  for (const p of byMonth) counts[replacementDueStatus(p.nextDueAt)]++;
  const total = byMonth.length;
  const points = due === "ALL" ? byMonth : byMonth.filter((p) => replacementDueStatus(p.nextDueAt) === due);
  // Panel bên phải: cả tháng, hoặc chỉ ngày đang chọn trên lịch; sắp theo ngày đến hạn.
  const panelPoints = (selectedDay ? points.filter((p) => dayKey(p.nextDueAt) === selectedDay) : [...points]).sort(
    (a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime()
  );

  const [editTarget, setEditTarget] = React.useState<ReplacementItem | null>(null);
  const [recordTarget, setRecordTarget] = React.useState<ReplacementItem | null>(null);
  const [delTarget, setDelTarget] = React.useState<ReplacementItem | null>(null);
  const [editLogTarget, setEditLogTarget] = React.useState<ReplacementLogItem | null>(null);
  const [delLogTarget, setDelLogTarget] = React.useState<ReplacementLogItem | null>(null);

  /* ---- Tab 2: Lịch sử thay thế (history) ---- */
  const [historyQ, setHistoryQ] = React.useState("");
  const history = useReplacementHistory();
  const logs = history.data?.data ?? [];
  // Chỉ các lần ghi nhận trong tháng/năm đang chọn (theo NGÀY THAY).
  const logsInMonth = logs.filter((l) => ym(l.replacedAt) === month);
  const filteredLogs = historyQ.trim()
    ? logsInMonth.filter((l) => {
        const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
        return `${l.replacement?.material.code} ${l.replacement?.material.name} ${device?.code ?? ""} ${device?.name ?? ""} ${l.note ?? ""}`.toLowerCase().includes(historyQ.toLowerCase());
      })
    : logsInMonth;
  const historyBackupRows = React.useMemo(() => {
    const qText = historyQ.trim().toLowerCase();
    if (!qText) return logs;
    return logs.filter((l) => {
      const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
      return `${l.replacement?.material.code ?? ""} ${l.replacement?.material.name ?? ""} ${device?.code ?? ""} ${device?.name ?? ""} ${device?.system ?? ""} ${l.note ?? ""} ${l.doneBy.name}`.toLowerCase().includes(qText);
    });
  }, [historyQ, logs]);
  const historyBackupColumns = React.useMemo(
    () => [
      { key: "stt", header: "STT", width: 7, align: "center" as const, value: (_row: ReplacementLogItem, index: number) => index + 1 },
      { key: "replacedAt", header: "Ngày thay", width: 14, align: "center" as const, value: (l: ReplacementLogItem) => formatDate(l.replacedAt) },
      { key: "material", header: "Tên vật tư", width: 30, value: (l: ReplacementLogItem) => l.replacement?.material.name },
      { key: "materialCode", header: "Mã vật tư", width: 24, value: (l: ReplacementLogItem) => l.replacement?.material.code },
      {
        key: "device",
        header: "Thiết bị",
        width: 32,
        value: (l: ReplacementLogItem) => {
          const device = l.replacement ? linkedDeviceOf(l.replacement) : null;
          return device ? `${device.code} - ${device.name}` : "";
        },
      },
      {
        key: "system",
        header: "Hệ thống",
        width: 28,
        value: (l: ReplacementLogItem) => (l.replacement ? linkedDeviceOf(l.replacement)?.system ?? l.replacement.system : ""),
      },
      {
        key: "quantity",
        header: "Số lượng",
        width: 14,
        align: "center" as const,
        value: (l: ReplacementLogItem) => (l.quantity != null ? `${l.quantity} ${l.replacement?.material.unit ?? ""}` : ""),
      },
      { key: "note", header: "Ghi chú", width: 34, value: (l: ReplacementLogItem) => l.note },
      { key: "doneBy", header: "Người thực hiện", width: 24, value: (l: ReplacementLogItem) => l.doneBy.name },
    ],
    []
  );

  /* ---- Xuất Excel/PDF: danh sách vật tư cần thay thế trong N tháng tới ----
   * Tính từ hôm nay, gồm cả điểm ĐÃ QUÁ HẠN (vẫn đang chờ thay) và điểm đến hạn
   * trong khoảng đã chọn. Không phụ thuộc tháng đang xem trên lịch. */
  const [horizon, setHorizon] = React.useState("1");
  const horizonMonths = Number(horizon);
  const horizonLabel = EXPORT_HORIZONS.find((h) => h.months === horizonMonths)?.label ?? `${horizonMonths} tháng`;
  const horizonEnd = addMonths(new Date(), horizonMonths);
  const exportRows = byMachine
    .filter((p) => new Date(p.nextDueAt) <= horizonEnd)
    .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())
    .map((p) => {
      const device = linkedDeviceOf(p);
      return {
        material: `${p.material.code} — ${p.material.name}`,
        target: device ? `${device.code} — ${device.name}` : p.location ?? "",
        system: device?.system ?? p.system ?? "",
        quantity: p.quantity * (p.deviceCount || 1),
        dvt: p.material.unit,
        interval: replacementIntervalLabel(p.intervalMonths, p.intervalNote),
        lastReplaced: formatDate(p.lastReplacedAt),
        nextDue: formatDate(p.nextDueAt),
        status: REPL_DUE[replacementDueStatus(p.nextDueAt)].label,
      };
    });

  return (
    <div className="space-y-6">
      <PageHeader title="LỊCH THAY THẾ VẬT TƯ" description="Tổng hợp lịch thay thế & lịch sử ghi nhận thay thế vật tư">
        {tab === "schedule" && (
          <>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="h-9 w-36 rounded-xl" aria-label="Khoảng thời gian xuất danh sách">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_HORIZONS.map((h) => (
                  <SelectItem key={h.months} value={String(h.months)}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportButton
              rows={exportRows}
              filename={`vat-tu-can-thay-the-${horizonMonths === 12 ? "1-nam" : `${horizonMonths}-thang`}`}
              title={`VẬT TƯ CẦN THAY THẾ TRONG ${horizonLabel.toUpperCase()}`}
              widths={{ material: 28, target: 24, system: 13, quantity: 8, dvt: 7, interval: 12, lastReplaced: 12, nextDue: 12, status: 11 }}
            />
          </>
        )}
        {tab === "history" && (
          <AnnualBackupExport
            rows={historyBackupRows}
            columns={historyBackupColumns}
            dateAccessor={(row) => row.replacedAt}
            title="LỊCH SỬ THAY THẾ VẬT TƯ"
            subtitle="Báo cáo backup lịch sử ghi nhận thay thế vật tư theo năm"
            filenamePrefix="lich-su-thay-the-vat-tu"
          />
        )}
      </PageHeader>

      {/* Tabs + bộ lọc tìm kiếm cùng hàng (bên phải) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        <TabBtn active={tab === "schedule"} onClick={() => setTab("schedule")} icon={CalendarCheck} label="Lịch thay thế" />
        <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={History} label="Lịch sử thay thế" count={logs.length} />
        {tab === "schedule" ? (
          <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
            <SearchBar value={q} onChange={setQ} placeholder="Tìm theo vật tư, thiết bị..." className="sm:w-64" />
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="sm:w-44" aria-label="Lọc theo tổ máy"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MACHINE_FILTERS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
            <SearchBar value={historyQ} onChange={setHistoryQ} placeholder="Tìm theo vật tư, thiết bị, ghi chú..." className="sm:w-72" />
            <MonthFilter value={month} onChange={setMonth} />
          </div>
        )}
      </div>

      {tab === "schedule" ? (
        <div className="space-y-6">
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              {/* Lịch tháng: mỗi điểm thay thế là 1 chip màu tại ngày đến hạn */}
              <ReplacementCalendar
                month={month}
                onMonthChange={(m) => {
                  setMonth(m);
                  setSelectedDay(null);
                }}
                points={points}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                headerRight={
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Chip compact active={due === "ALL"} onClick={() => setDue("ALL")} label="Tất cả" count={total} />
                    {REPL_DUE_ORDER.map((k) => (
                      <Chip key={k} compact active={due === k} onClick={() => setDue(k)} label={REPL_DUE[k].label} count={counts[k]} dot={REPL_DUE[k].dot} />
                    ))}
                  </div>
                }
              />

              {/* Panel danh sách theo dõi (cả tháng hoặc ngày đang chọn) */}
              <Card className="flex max-h-[760px] flex-col overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
                    <Repeat className="h-4 w-4 text-accent" /> Danh sách theo dõi
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {selectedDay ? (
                      <>
                        <span>
                          Ngày <span className="font-semibold text-ink">{formatDate(selectedDay)}</span> · {panelPoints.length} điểm
                        </span>
                        <button type="button" className="font-medium text-accent hover:underline" onClick={() => setSelectedDay(null)}>
                          Xem cả tháng
                        </button>
                      </>
                    ) : (
                      <span>
                        Tháng <span className="font-semibold text-ink">{ymLabel(month)}</span> · {panelPoints.length} điểm thay thế
                        {machineFilter !== "ALL" && <> · {MACHINE_FILTERS.find((m) => m.key === machineFilter)?.label}</>}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                  {panelPoints.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
                      {selectedDay
                        ? "Không có điểm thay thế trong ngày này."
                        : `Không có điểm thay thế đến hạn trong tháng ${ymLabel(month)}.`}
                    </div>
                  ) : (
                    panelPoints.map((p) => {
                      const st = replacementDueStatus(p.nextDueAt);
                      const device = linkedDeviceOf(p);
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:bg-card"
                          style={{ borderLeft: `4px solid ${REPL_DUE[st].dot}` }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-ink" title={p.material.name}>
                                {p.material.name}
                              </div>
                              <div className="font-mono text-[11px] text-navy">{p.material.code}</div>
                            </div>
                            <ReplacementBadge nextDueAt={p.nextDueAt} withText />
                          </div>
                          <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Cpu className="h-3.5 w-3.5 shrink-0 text-navy" />
                              {device ? (
                                <Link href={`/devices/${device.id}`} className="truncate hover:underline" title={`${device.code} — ${device.name}`}>
                                  {device.code} — {device.name}
                                </Link>
                              ) : (
                                <span>Chưa chọn thiết bị</span>
                              )}
                            </div>
                            <div>
                              Chu kỳ {replacementIntervalLabel(p.intervalMonths, p.intervalNote)} · Lần gần nhất {formatDate(p.lastReplacedAt)}
                            </div>
                            <div>
                              Đến hạn: <span className="font-semibold text-ink">{formatDate(p.nextDueAt)}</span>
                            </div>
                          </div>
                          {(canManage || canDelete) && (
                            <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
                              {canManage && (
                                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-accent hover:bg-accent/10" onClick={() => setRecordTarget(p)}>
                                  <RefreshCw className="h-3.5 w-3.5" /> Ghi nhận
                                </Button>
                              )}
                              {canManage && (
                                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setEditTarget(p)}>
                                  <Pencil className="h-3.5 w-3.5" /> Sửa
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setDelTarget(p)}>
                                  <Trash2 className="h-3.5 w-3.5" /> Xoá
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
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
                    <TableHead>Thiết bị</TableHead>
                    <TableHead className="text-center">Hệ thống</TableHead>
                    <TableHead className="text-center">Ngày thay</TableHead>
                    <TableHead className="text-center">Số lượng</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-center">Người thực hiện</TableHead>
                    <TableHead className="text-center">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-ink">{l.replacement?.material.name ?? "—"}</div>
                        <div className="font-mono text-xs text-navy">{l.replacement?.material.code ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {l.replacement && linkedDeviceOf(l.replacement) ? `${linkedDeviceOf(l.replacement)!.code} — ${linkedDeviceOf(l.replacement)!.name}` : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{l.replacement && linkedDeviceOf(l.replacement)?.system ? linkedDeviceOf(l.replacement)!.system : "—"}</TableCell>
                      <TableCell className="text-center text-sm text-ink">{formatDate(l.replacedAt)}</TableCell>
                      <TableCell className="text-center text-sm">{l.quantity != null ? `${l.quantity} ${l.replacement?.material.unit ?? ""}` : "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground" title={l.note ?? undefined}>{l.note || "—"}</TableCell>
                      <TableCell className="text-center">
                        <UserAvatar user={l.doneBy} />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          {canManage && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="Chỉnh sửa"
                              onClick={() => setEditLogTarget(l)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Xóa"
                              onClick={() => setDelLogTarget(l)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {!canManage && !canDelete && <span className="text-sm text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
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
          {editTarget && <ReplacementPointForm materialId={editTarget.materialId} point={editTarget} defaultSystem={editTarget.material.system} onDone={() => setEditTarget(null)} />}
        </DialogContent>
      </Dialog>

      <RecordReplacementDialog point={recordTarget} onClose={() => setRecordTarget(null)} />

      <ReplacementLogEditDialog log={editLogTarget} onClose={() => setEditLogTarget(null)} />

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

      <ConfirmDialog
        open={!!delLogTarget}
        onOpenChange={(o) => !o && setDelLogTarget(null)}
        title="Xoá ghi nhận thay thế?"
        description="Chỉ xoá bản ghi lịch sử thay thế này, không tự khôi phục điểm theo dõi đã lưu trữ."
        confirmLabel="Xoá"
        loading={delLog.isPending}
        onConfirm={async () => {
          if (!delLogTarget) return;
          try {
            await delLog.mutateAsync(delLogTarget.id);
            toast.success("Đã xoá ghi nhận thay thế");
            setDelLogTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function ReplacementLogEditDialog({ log, onClose }: { log: ReplacementLogItem | null; onClose: () => void }) {
  const update = useUpdateReplacementLog();
  const [replacedAt, setReplacedAt] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!log) return;
    setReplacedAt(formatDateInput(log.replacedAt));
    setQuantity(log.quantity != null ? String(log.quantity) : "");
    setNote(log.note ?? "");
  }, [log]);

  async function submit() {
    if (!log) return;
    try {
      await update.mutateAsync({ id: log.id, replacedAt, quantity: quantity || null, note });
      toast.success("Đã cập nhật ghi nhận thay thế");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Chỉnh sửa ghi nhận thay thế</DialogTitle></DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium text-ink">{log.replacement?.material.name ?? "Vật tư"}</div>
              <div className="font-mono text-xs text-navy">{log.replacement?.material.code ?? ""}</div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block">Ngày thay thế</Label>
                <Input type="date" value={replacedAt} onChange={(e) => setReplacedAt(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">Số lượng</Label>
                <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Nội dung ghi chú..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={update.isPending}>Huỷ</Button>
              <Button onClick={submit} disabled={update.isPending || !replacedAt}>Lưu thay đổi</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function UserAvatar({ user }: { user: { name: string; position: string | null; avatarUrl: string | null } }) {
  return (
    <div className="flex justify-center" title={`${user.name}${user.position ? ` · ${user.position}` : ""}`} aria-label={user.name}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-[11px] font-bold text-white shadow-sm ring-1 ring-border">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initials(user.name)
        )}
      </span>
    </div>
  );
}

function Chip({ active, onClick, label, count, dot, compact }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border transition-colors",
        compact ? "gap-1.5 px-2 py-0.5 text-xs" : "gap-2 px-3 py-1 text-sm",
        active ? "border-navy bg-navy text-white" : "border-border bg-white text-ink hover:border-accent"
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={cn("rounded-full px-1.5", compact ? "text-[10px]" : "text-xs", active ? "bg-white/20" : "bg-muted")}>{count}</span>
    </button>
  );
}
