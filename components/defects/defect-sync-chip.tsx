"use client";

import * as React from "react";
import type { DefectSyncRun } from "@prisma/client";
import {
  RefreshCw,
  ChevronDown,
  CloudDownload,
  History,
  Activity,
  Pencil,
  Plus,
  BellRing,
  ListChecks,
  Loader2,
  SkipForward,
  CircleHelp,
  ServerOff,
  ShieldAlert,
  TimerReset,
  AlertTriangle,
  CheckCircle2,
  Route,
  Clock3,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type DefectSyncQueueItem,
  useDefectSyncQueue,
  useDefectTwoWaySync,
  useSetDefectTwoWaySync,
  useSkipDefectSyncEvent,
} from "@/hooks/useDefects";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import type { DefectSyncHealth } from "@/lib/defect-sync-health";

/**
 * Trạng thái đồng bộ khiếm khuyết gói trong MỘT chip ở thanh tiêu đề: bấm vào mới mở
 * bảng chi tiết (số liệu lần chạy + cờ đồng bộ hai chiều). Trước đây hai khối này là
 * banner chiếm trọn chiều ngang, đẩy bộ lọc và bảng dữ liệu xuống dưới màn hình.
 *
 * Trạng thái sức khỏe được backend tổng hợp từ lịch sử nhận Sheet, cấu hình năm đích
 * và transactional outbox; các thao tác bật/tắt vẫn dùng API đồng bộ hai chiều cũ.
 */

const fullFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const logFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function toneOf(run: DefectSyncRun) {
  if (run.status === "RUNNING") return "bg-sky-500";
  return run.status === "SUCCESS" ? "bg-emerald-500" : "bg-rose-500";
}

function sourceLabelOf(run: DefectSyncRun) {
  return (
    run.expectedSources
      .map((source) => (source === "CO" ? "Cơ" : source === "DIEN" ? "Điện" : source))
      .join(", ") || "Không xác định nguồn"
  );
}

export function DefectSyncChip({
  runs,
  health,
  running,
  syncing,
  canRunSync,
  canManageTwoWaySync,
  sheetUrl,
  sheetLabel,
  onSync,
}: {
  /** 5 lượt chạy gần nhất do /api/defects/sync trả sẵn; [0] là mới nhất. */
  runs: DefectSyncRun[];
  health?: DefectSyncHealth;
  running: boolean;
  syncing: boolean;
  canRunSync: boolean;
  canManageTwoWaySync: boolean;
  sheetUrl?: string;
  sheetLabel?: string;
  onSync: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [showLog, setShowLog] = React.useState(false);
  const run = runs[0];
  const previous = runs.slice(1);
  const success = run?.status === "SUCCESS";
  const failed = !!run && !running && !success;
  const healthError = health?.level === "ERROR";
  const healthWarning = health?.level === "WARNING";

  const label = running && !healthError
    ? "Google Sheet · Đang đồng bộ"
    : healthError
      ? "Google Sheet · Có lỗi"
      : healthWarning
        ? health?.queue.waiting
          ? `Google Sheet · ${health.queue.waiting} đang chờ`
          : "Google Sheet · Cần kiểm tra"
        : health
          ? "Google Sheet · Hoạt động tốt"
          : "Google Sheet · Đang kiểm tra";
  const dotTone = healthError
    ? "bg-rose-500"
    : healthWarning
      ? "bg-amber-500"
      : running
        ? "bg-sky-500"
        : health
          ? "bg-emerald-500"
          : "bg-slate-300";
  const borderTone = healthError
    ? "border-rose-200 bg-rose-50/40 hover:border-rose-300"
    : healthWarning
      ? "border-amber-200 bg-amber-50/40 hover:border-amber-300"
      : "border-border bg-white hover:border-emerald-300";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 w-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-0 text-sm font-semibold text-ink shadow-sm transition-colors sm:h-10 sm:w-auto sm:justify-start sm:gap-2 sm:rounded-lg sm:px-3",
            borderTone,
            open && "ring-2 ring-accent/15"
          )}
          aria-label={`${label}. Mở công cụ Google Sheet`}
          title="Mở công cụ Google Sheet"
        >
          <span className="relative sm:hidden" aria-hidden="true">
            <FileSpreadsheet className="h-[18px] w-[18px] text-blue-700" />
            {running && <span className="absolute -right-1 -top-1 h-2 w-2 animate-ping rounded-full bg-sky-400 opacity-70" />}
            <span className={cn("absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-white", dotTone)} />
          </span>
          <span className="relative hidden h-2 w-2 shrink-0 sm:flex">
            {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-70" />}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotTone)} />
          </span>
          <span className="hidden sm:inline">{label}</span>
          <span className="hidden sm:contents"><TwoWayWarnDot enabled={canManageTwoWaySync} /></span>
          <ChevronDown className={cn("hidden h-3.5 w-3.5 text-muted-foreground transition-transform sm:block", open && "rotate-180")} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="max-h-[78vh] w-[calc(100vw-24px)] max-w-[470px] overflow-y-auto p-4">
        {sheetUrl && sheetLabel && (
          <div className="mb-4 border-b border-border pb-4 sm:hidden">
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-3 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white shadow-sm">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">Mở {sheetLabel}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">Xem dữ liệu nguồn trên Google Sheet</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-sky-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone)} />
              {run ? (running ? "Đang đồng bộ" : success ? "Đồng bộ thành công" : "Đồng bộ thất bại") : "Chưa có lần đồng bộ nào"}
            </div>
            {run && (
              <div className="mt-1 text-xs text-muted-foreground">
                Nguồn {sourceLabelOf(run)} · Google Sheet → DH1 · {fullFmt.format(new Date(run.startedAt))}
              </div>
            )}
          </div>
          {canRunSync && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={syncing || running}
              onClick={onSync}
            >
              {syncing || running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {running ? "Đang chạy…" : "Đồng bộ ngay"}
            </Button>
          )}
        </div>

        {health && <SyncHealthOverview health={health} running={running} />}

        {run && !running && (
          <div className="mt-3 grid grid-cols-5 gap-px overflow-hidden rounded-lg border border-border bg-border">
            <Stat label="Đọc" value={run.readCount} />
            <Stat label="Mới" value={run.createdCount} />
            <Stat label="Cập nhật" value={run.updatedCount} />
            <Stat label="Không đổi" value={run.unchangedCount} />
            <Stat label="Mất nguồn" value={run.missingCount} flag />
          </div>
        )}

        {failed && run?.error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{run.error}</p>
        )}

        {canManageTwoWaySync && <TwoWaySyncRow />}

        {/* Nhật ký thu gọn — dùng luôn 5 lượt API đã trả, không gọi thêm gì. */}
        {previous.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              aria-expanded={showLog}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-muted/50"
            >
              <History className="h-4 w-4 text-muted-foreground" />
              {showLog ? "Ẩn nhật ký đồng bộ" : `Xem ${previous.length} lượt đồng bộ trước`}
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showLog && "rotate-180")} />
            </button>

            {showLog && (
              <ul className="mt-2 space-y-1">
                {previous.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/40"
                    title={item.error ?? undefined}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneOf(item))} />
                    <span className="shrink-0 font-medium tabular-nums text-ink">{logFmt.format(new Date(item.startedAt))}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{sourceLabelOf(item)}</span>
                    {item.status === "SUCCESS" ? (
                      // Ghi rõ "mới"/"sửa" thay vì ký hiệu +/~ — ở cỡ chữ này dấu ~ dễ bị
                      // đọc nhầm thành dấu trừ (tưởng là giảm).
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {item.readCount.toLocaleString("vi-VN")} đọc
                        {item.createdCount > 0 && (
                          <span className="ml-1.5 font-semibold text-emerald-600">{item.createdCount} mới</span>
                        )}
                        {item.updatedCount > 0 && (
                          <span className="ml-1.5 font-semibold text-blue-600">{item.updatedCount} sửa</span>
                        )}
                      </span>
                    ) : (
                      <span className={cn("shrink-0 font-semibold", item.status === "RUNNING" ? "text-sky-600" : "text-rose-600")}>
                        {item.status === "RUNNING" ? "đang chạy" : "lỗi"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SyncHealthOverview({ health, running }: { health: DefectSyncHealth; running: boolean }) {
  const healthy = health.level === "HEALTHY";
  const error = health.level === "ERROR";
  const tone = error
    ? "border-rose-200 bg-rose-50/70 text-rose-950"
    : healthy
      ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
      : "border-amber-200 bg-amber-50/70 text-amber-950";
  const StatusIcon = error ? ShieldAlert : healthy ? CheckCircle2 : AlertTriangle;
  const destinationsReady = health.destinations.every((destination) => destination.configured);

  return (
    <div className="mt-3 space-y-3">
      <div className={cn("rounded-xl border p-3", tone)}>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-sm ring-1 ring-current/10">
            <StatusIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">
              {error
                ? "Có lỗi cần kiểm tra"
                : healthy
                  ? running ? "Hệ thống đang nhận dữ liệu" : "Các luồng đang hoạt động tốt"
                  : "Có thay đổi đang chờ xử lý"}
            </p>
            {health.issues.length === 0 ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-current/75">
                Cấu hình đủ năm đích và không có sự kiện ghi Sheet bị kẹt.
              </p>
            ) : (
              <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-current/85">
                {health.issues.map((issue, index) => (
                  <li key={`${issue.level}-${index}`} className="flex gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            <Route className="h-3.5 w-3.5 text-blue-700" />
            5 đích ghi nhận
          </div>
          <span className={cn("text-[10px] font-semibold", destinationsReady ? "text-emerald-700" : "text-rose-700")}>
            {destinationsReady ? "Đã kiểm tra cấu hình" : "Thiếu cấu hình"}
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {health.destinations.map((destination) => (
            <div key={destination.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink">{destination.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{destination.sourceLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
                  {destination.sheetName}
                </code>
                <span
                  className={cn("h-2 w-2 rounded-full", destination.configured ? "bg-emerald-500" : "bg-rose-500")}
                  title={destination.configured ? "Đã cấu hình" : "Thiếu cấu hình"}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {health.sources.map((source) => (
          <div key={source.source} className="rounded-lg border border-border bg-muted/15 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-ink">{source.label}</span>
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                {source.configuredBy === "ENVIRONMENT" ? "Cấu hình server" : "Production mặc định"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              {source.lastSuccessAt
                ? `Nhận dữ liệu ${fullFmt.format(new Date(source.lastSuccessAt))}`
                : "Chưa có lượt nhận thành công"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, flag = false }: { label: string; value: number; flag?: boolean }) {
  return (
    <div className="bg-muted/20 px-1 py-2 text-center">
      <b
        className={cn(
          "block text-[15px] font-bold leading-none tabular-nums",
          value === 0 ? "text-muted-foreground" : flag ? "text-amber-600" : "text-ink"
        )}
      >
        {value.toLocaleString("vi-VN")}
      </b>
      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

/** Chấm hổ phách trên chip khi đồng bộ hai chiều đang TẮT (chỉ người quản trị cờ này thấy). */
function TwoWayWarnDot({ enabled }: { enabled: boolean }) {
  const query = useDefectTwoWaySync(enabled);
  if (!enabled || query.data?.data?.twoWaySyncEnabled !== false) return null;
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
      title="Đồng bộ hai chiều đang tắt"
    />
  );
}

function TwoWaySyncRow() {
  const query = useDefectTwoWaySync();
  const setEnabled = useSetDefectTwoWaySync();
  const [queueOpen, setQueueOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [reusableNumbersOpen, setReusableNumbersOpen] = React.useState(false);
  type SettingKey = "twoWaySyncEnabled" | "operationUpdateEnabled" | "websiteCreateEnabled" | "websiteRemindEnabled";
  const [queueDecision, setQueueDecision] = React.useState<{
    key: SettingKey;
    label: string;
    count: number;
    processing: number;
  } | null>(null);
  const setting = query.data?.data;
  const enabled = setting?.twoWaySyncEnabled ?? false;

  async function toggle(
    key: SettingKey,
    current: boolean,
    label: string,
    pendingAction?: "resume" | "discard"
  ) {
    try {
      await setEnabled.mutateAsync({ key, enabled: !current, pendingAction });
      setQueueDecision(null);
      toast.success(`Đã ${!current ? "bật" : "tắt"} ${label}`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function requestToggle(key: SettingKey, current: boolean, label: string) {
    if (current) {
      void toggle(key, true, label);
      return;
    }
    const metricKeys = {
      twoWaySyncEnabled: ["queued", "processing"],
      operationUpdateEnabled: ["queuedUpdate", "processingUpdate"],
      websiteCreateEnabled: ["queuedCreate", "processingCreate"],
      websiteRemindEnabled: ["queuedRemind", "processingRemind"],
    } as const;
    const [queuedKey, processingKey] = metricKeys[key];
    const queued = setting?.metrics[queuedKey] ?? 0;
    const processing = setting?.metrics[processingKey] ?? 0;
    if (queued > 0 || processing > 0) {
      setQueueDecision({ key, label, count: queued + processing, processing });
      return;
    }
    void toggle(key, false, label);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
        <FeatureToggle
          label="Đồng bộ hai chiều"
          description="Công tắc tổng cho chiều DH1 → Google Sheet"
          enabled={enabled}
          loading={query.isLoading || setEnabled.isPending}
          onToggle={() => requestToggle("twoWaySyncEnabled", enabled, "đồng bộ hai chiều")}
        />
        <div className="mt-3 space-y-2 border-t border-blue-200/70 pt-3">
          <FeatureToggle
            icon={Pencil}
            label="Cập nhật Vận hành"
            description="Ghi ngược các trường Vận hành"
            enabled={setting?.operationUpdateEnabled ?? false}
            loading={query.isLoading || setEnabled.isPending}
            disabled={!enabled}
            onToggle={() => requestToggle(
              "operationUpdateEnabled",
              setting?.operationUpdateEnabled ?? false,
              "Cập nhật Vận hành"
            )}
          />
          <FeatureToggle
            icon={Plus}
            label="Thêm mới từ website"
            description="Tạo dòng khiếm khuyết mới trên Sheet"
            enabled={setting?.websiteCreateEnabled ?? false}
            loading={query.isLoading || setEnabled.isPending}
            disabled={!enabled}
            onToggle={() => requestToggle(
              "websiteCreateEnabled",
              setting?.websiteCreateEnabled ?? false,
              "Thêm mới từ website"
            )}
          />
          <FeatureToggle
            icon={BellRing}
            label="Nhắc lại từ website"
            description="Ghi lần nhắc lại vào Google Sheet"
            enabled={setting?.websiteRemindEnabled ?? false}
            loading={query.isLoading || setEnabled.isPending}
            disabled={!enabled}
            onToggle={() => requestToggle(
              "websiteRemindEnabled",
              setting?.websiteRemindEnabled ?? false,
              "Nhắc lại từ website"
            )}
          />
        </div>
      </div>

      {setting?.metrics && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Lưu lượng ghi ngược hôm nay
            </div>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp className="h-3.5 w-3.5" />
              Khắc phục sự cố
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <TrafficStat label="Cập nhật" value={setting.metrics.todayUpdate} />
            <TrafficStat label="Thêm mới" value={setting.metrics.todayCreate} />
            <TrafficStat label="Nhắc lại" value={setting.metrics.todayRemind} />
            <TrafficStat label="Đang chờ" value={setting.metrics.waiting} warn />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Thành công <b className="text-emerald-700">{setting.metrics.todaySuccess}</b>
              {" · "}
              Thất bại <b className="text-rose-700">{setting.metrics.todayFailed}</b>
            </span>
            <span>
              TB {setting.metrics.averageDurationMs === null
                ? "—"
                : `${(setting.metrics.averageDurationMs / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full bg-white"
            onClick={() => setQueueOpen(true)}
          >
            <ListChecks className="h-4 w-4" />
            Xem hàng đợi đồng bộ
            {setting.metrics.waiting > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800">
                {setting.metrics.waiting}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full bg-white"
            onClick={() => setReusableNumbersOpen(true)}
          >
            <RefreshCw className="h-4 w-4 text-emerald-700" />
            STT còn trống
            <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-800">
              {setting.reusableRequestNumbers?.length ?? 0}
            </span>
          </Button>
        </div>
      )}

      <DefectSyncQueueDialog open={queueOpen} onOpenChange={setQueueOpen} />

      <SyncTroubleshootingDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <ReusableRequestNumbersDialog
        open={reusableNumbersOpen}
        onOpenChange={setReusableNumbersOpen}
        items={setting?.reusableRequestNumbers ?? []}
      />

      <Dialog
        open={queueDecision !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setQueueDecision(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Còn thay đổi cũ chưa gửi</DialogTitle>
            <DialogDescription>
              Hàng đợi đang có {queueDecision?.count ?? 0} thay đổi thuộc tính năng này
              {setting?.metrics.oldestWaitingAt
                ? `, cũ nhất từ ${fullFmt.format(new Date(setting.metrics.oldestWaitingAt))}`
                : ""}.
              Nếu Google Sheet đã được chỉnh trong thời gian tắt, gửi tiếp có thể ghi đè dữ liệu trên Sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {(queueDecision?.processing ?? 0) > 0 && (
              <p className="mb-1 font-semibold">
                Có {queueDecision?.processing} sự kiện đang giữ khóa. Hãy chắc chắn execution n8n cũ đã dừng trước khi tiếp tục.
              </p>
            )}
            Chọn “Bỏ hàng đợi cũ” để lấy Google Sheet làm nguồn chuẩn ở lần đồng bộ tiếp theo.
            Chọn “Tiếp tục gửi” sẽ thu hồi các khóa đang kẹt về trạng thái chờ và gửi lại từ website.
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" onClick={() => setQueueDecision(null)}>
              Chưa bật
            </Button>
            <Button
              variant="outline"
              disabled={setEnabled.isPending}
              onClick={() => {
                if (queueDecision) void toggle(queueDecision.key, false, queueDecision.label, "discard");
              }}
            >
              Bỏ hàng đợi cũ
            </Button>
            <Button
              disabled={setEnabled.isPending}
              onClick={() => {
                if (queueDecision) void toggle(queueDecision.key, false, queueDecision.label, "resume");
              }}
            >
              Tiếp tục gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReusableRequestNumbersDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{
    id: string;
    requestNumber: string | null;
    requestType: string | null;
    sourceSheetName: string | null;
    requestNumberReleasedAt: string | null;
  }>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <DialogHeader className="border-b border-emerald-100 bg-emerald-50/70 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-emerald-950">
            <RefreshCw className="h-5 w-5 text-emerald-700" />
            STT còn trống
          </DialogTitle>
          <DialogDescription>
            Các STT được giải phóng do hủy hoặc đổi số, đã được Sheet xác nhận làm trống.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-ink">Không có STT trống có thể cấp lại</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Phiếu vừa hủy chỉ xuất hiện sau khi n8n ghi và ACK việc làm trống dòng trên Sheet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-bold tabular-nums text-ink">{item.requestNumber || "Chưa có STT"}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.requestType || "Chưa rõ loại"}
                      {item.sourceSheetName ? ` · Sheet ${item.sourceSheetName}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">Sẵn sàng cấp lại</span>
                    {item.requestNumberReleasedAt && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Trả lúc {fullFmt.format(new Date(item.requestNumberReleasedAt))}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-amber-100 bg-amber-50/60 px-6 py-3 text-xs leading-relaxed text-amber-900">
          Hệ thống tự ưu tiên STT trống nhỏ nhất khi tạo phiếu mới cùng loại, cùng năm và cùng Sheet.
          Danh sách chỉ giữ STT đủ điều kiện trong cửa sổ 6 giờ.
        </div>
        <DialogFooter className="border-t border-border bg-slate-50/70 px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SyncTroubleshootingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogHeader className="border-b border-blue-100 bg-blue-50/70 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-blue-950">
            <CircleHelp className="h-5 w-5 text-blue-700" />
            Quy trình khắc phục đồng bộ Google Sheet
          </DialogTitle>
          <DialogDescription>
            Kiểm tra theo thứ tự dưới đây để không ghi trùng hoặc bỏ sót phiếu.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto px-6 py-5 text-sm">
          <TroubleshootingStep
            icon={ServerOff}
            title="Website vừa build, restart hoặc lỗi DNS"
            tone="blue"
          >
            Chờ website hoạt động ổn định. Workflow tự thử lại tối đa khoảng 4 phút.
            Trong thời gian này tuyệt đối không nhập lại phiếu trực tiếp trên Sheet.
          </TroubleshootingStep>
          <TroubleshootingStep
            icon={TimerReset}
            title="Hàng đợi còn Đang xử lý hoặc Đồng bộ lỗi"
            tone="amber"
          >
            Nếu n8n không còn execution đang chạy: tắt đồng bộ, bật lại và chọn
            <b> Tiếp tục gửi</b>. Hệ thống đưa PROCESSING và FAILED về PENDING để chạy ngay.
          </TroubleshootingStep>
          <TroubleshootingStep
            icon={ShieldAlert}
            title="Trước khi thu hồi hàng đợi"
            tone="rose"
          >
            Vào n8n → Executions và dừng execution cũ nếu còn trạng thái Running.
            Chỉ chọn <b>Bỏ hàng đợi cũ</b> khi chắc chắn không cần gửi các thay đổi từ website.
          </TroubleshootingStep>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-700">
            <b>Gợi ý đọc trạng thái:</b> PENDING là đang chờ; PROCESSING là n8n đang giữ;
            FAILED sẽ được thử lại; SUCCESS là đã ghi và xác nhận; SKIPPED là đã chủ động bỏ qua.
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-slate-50/70 px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>Đã hiểu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TroubleshootingStep({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone: "blue" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/60 text-blue-800",
    amber: "border-amber-200 bg-amber-50/60 text-amber-900",
    rose: "border-rose-200 bg-rose-50/60 text-rose-900",
  };
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", tones[tone])}>
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 shrink-0" />
        {title}
      </div>
      <p className="pl-6 text-xs leading-relaxed text-current/85">{children}</p>
    </div>
  );
}

function payloadText(item: DefectSyncQueueItem, key: string) {
  return String(item.payload?.[key] ?? "").trim();
}

function queueActionLabel(item: DefectSyncQueueItem) {
  if (item.payload?.cancellation === true) return "Hủy phiếu";
  if (item.eventType === "CREATE") return "Thêm phiếu";
  if (item.eventType === "REMIND") return "Nhắc lại";
  return "Cập nhật";
}

function DefectSyncQueueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queue = useDefectSyncQueue(open);
  const skip = useSkipDefectSyncEvent();
  const [selected, setSelected] = React.useState<DefectSyncQueueItem | null>(null);
  const items = queue.data?.data ?? [];

  async function confirmSkip() {
    if (!selected) return;
    try {
      const force = selected.status === "PROCESSING";
      await skip.mutateAsync({ eventId: selected.id, force });
      toast.success(`${force ? "Đã thu hồi và bỏ qua" : "Đã bỏ qua"} đồng bộ phiếu ${payloadText(selected, "requestNumber") || selected.defectId}`);
      setSelected(null);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border bg-slate-50/80 px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-blue-700" />
              Hàng đợi đồng bộ Google Sheet
            </DialogTitle>
            <DialogDescription>
              Các thay đổi từ website đang chờ n8n ghi sang Sheet. Quản trị viên có thể bỏ qua từng sự kiện bị lỗi.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto px-6 py-4">
            {queue.isLoading ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang đọc hàng đợi…
              </div>
            ) : queue.isError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {(queue.error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-center">
                <ListChecks className="mb-2 h-8 w-8 text-emerald-600" />
                <p className="font-semibold text-ink">Không có đồng bộ đang chờ</p>
                <p className="mt-1 text-xs text-muted-foreground">Hàng đợi hiện đã được xử lý hết.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const processing = item.status === "PROCESSING";
                  const failed = item.status === "FAILED";
                  const requestNumber = payloadText(item, "requestNumber") || "Chưa có STT";
                  const content = payloadText(item, "content") || "Không có nội dung phiếu";
                  const sheetName = payloadText(item, "sourceSheetName");
                  return (
                    <div key={item.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-ink">{requestNumber}</span>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              {queueActionLabel(item)}
                            </span>
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-bold",
                              processing
                                ? "bg-sky-50 text-sky-700"
                                : failed
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700"
                            )}>
                              {processing ? "Đang xử lý" : failed ? "Đồng bộ lỗi" : "Đang chờ"}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-ink/80">{content}</p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>Tạo lúc {fullFmt.format(new Date(item.createdAt))}</span>
                            {sheetName && <span>Sheet: {sheetName}</span>}
                            {item.attemptCount > 0 && <span>Đã thử {item.attemptCount} lần</span>}
                          </div>
                          {item.lastError && (
                            <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-2 text-xs leading-relaxed text-rose-700">
                              {item.lastError}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          disabled={skip.isPending}
                          title={processing ? "Thu hồi sự kiện sau khi đã dừng n8n và tắt loại đồng bộ" : "Không gửi sự kiện này sang Sheet"}
                          onClick={() => setSelected(item)}
                        >
                          <SkipForward className="h-4 w-4" />
                          {processing ? "Thu hồi & bỏ qua" : "Bỏ qua"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border bg-slate-50/60 px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={selected !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelected(null);
        }}
        title={selected?.status === "PROCESSING" ? "Thu hồi và bỏ qua lượt đang xử lý?" : "Bỏ qua lượt đồng bộ này?"}
        description={selected
          ? `Phiếu ${payloadText(selected, "requestNumber") || selected.defectId} sẽ không được n8n ghi sang Google Sheet.`
          : undefined}
        confirmLabel={selected?.status === "PROCESSING" ? "Thu hồi và bỏ qua" : "Bỏ qua đồng bộ"}
        loading={skip.isPending}
        onConfirm={() => void confirmSkip()}
      >
        {selected?.status === "PROCESSING" && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900">
            Trước khi xác nhận: hãy dừng execution/workflow ghi ngược trên n8n và tắt loại đồng bộ tương ứng trên website. Nếu worker vẫn chạy, Google Sheet vẫn có thể bị ghi sau khi sự kiện được bỏ qua.
          </div>
        )}
        {selected?.payload?.cancellation === true && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            Phiếu hủy sẽ được kết thúc trạng thái chờ trên website, nhưng STT không được trả lại để tránh trùng số khi Sheet chưa xác nhận.
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

function FeatureToggle({
  icon: Icon,
  label,
  description,
  enabled,
  loading,
  disabled = false,
  onToggle,
}: {
  icon?: typeof Pencil;
  label: string;
  description: string;
  enabled: boolean;
  loading: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", disabled && "opacity-50")}>
      <div className="flex min-w-0 items-start gap-2">
        {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />}
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">{label}</div>
          <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={loading || disabled}
        title={`${enabled ? "Tắt" : "Bật"} ${label}`}
        aria-label={`${enabled ? "Tắt" : "Bật"} ${label}`}
        aria-pressed={enabled}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed",
          enabled ? "bg-emerald-500" : "bg-slate-300"
        )}
      >
        <span className={cn(
          "absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
          enabled ? "translate-x-[18px]" : "translate-x-0"
        )} />
      </button>
    </div>
  );
}

function TrafficStat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-md bg-white px-1 py-2 ring-1 ring-border/70">
      <b className={cn("block text-base tabular-nums", warn && value > 0 ? "text-amber-700" : "text-ink")}>
        {value.toLocaleString("vi-VN")}
      </b>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
