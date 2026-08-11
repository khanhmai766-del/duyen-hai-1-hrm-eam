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

/**
 * Trạng thái đồng bộ khiếm khuyết gói trong MỘT chip ở thanh tiêu đề: bấm vào mới mở
 * bảng chi tiết (số liệu lần chạy + cờ đồng bộ hai chiều). Trước đây hai khối này là
 * banner chiếm trọn chiều ngang, đẩy bộ lọc và bảng dữ liệu xuống dưới màn hình.
 *
 * Thuần GIAO DIỆN: dữ liệu và hành động vẫn do trang truyền vào (run/onSync) hoặc dùng
 * đúng hook cũ (cờ hai chiều) — không đổi API, không đổi luồng nghiệp vụ.
 */

const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
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
  running,
  syncing,
  canRunSync,
  canManageTwoWaySync,
  onSync,
}: {
  /** 5 lượt chạy gần nhất do /api/defects/sync trả sẵn; [0] là mới nhất. */
  runs: DefectSyncRun[];
  running: boolean;
  syncing: boolean;
  canRunSync: boolean;
  canManageTwoWaySync: boolean;
  onSync: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [showLog, setShowLog] = React.useState(false);
  const run = runs[0];
  const previous = runs.slice(1);
  const success = run?.status === "SUCCESS";
  const failed = !!run && !running && !success;

  const label = !run ? "Chưa đồng bộ" : running ? "Đang đồng bộ…" : success ? "Đã đồng bộ" : "Đồng bộ lỗi";
  const dotTone = running ? "bg-sky-500" : success ? "bg-emerald-500" : failed ? "bg-rose-500" : "bg-slate-300";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-ink shadow-sm transition-colors",
            open ? "border-accent ring-2 ring-accent/15" : "border-border hover:border-muted-foreground/30"
          )}
          title="Xem chi tiết đồng bộ khiếm khuyết"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-70" />}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotTone)} />
          </span>
          {label}
          {run && <span className="font-medium text-muted-foreground">{timeFmt.format(new Date(run.startedAt))}</span>}
          <TwoWayWarnDot enabled={canManageTwoWaySync} />
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[430px] p-4">
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
  type SettingKey = "twoWaySyncEnabled" | "operationUpdateEnabled" | "websiteCreateEnabled" | "websiteRemindEnabled";
  const [queueDecision, setQueueDecision] = React.useState<{
    key: SettingKey;
    label: string;
    count: number;
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
    if (processing > 0) {
      toast.error(`Còn ${processing} thay đổi đang xử lý, chưa thể bật lại`);
      return;
    }
    if (queued > 0) {
      setQueueDecision({ key, label, count: queued });
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
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Lưu lượng ghi ngược hôm nay
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
        </div>
      )}

      <DefectSyncQueueDialog open={queueOpen} onOpenChange={setQueueOpen} />

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
            Chọn “Bỏ hàng đợi cũ” để lấy Google Sheet làm nguồn chuẩn ở lần đồng bộ tiếp theo.
            Chỉ chọn “Tiếp tục gửi” khi chắc chắn dữ liệu website mới là dữ liệu cần giữ.
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
      await skip.mutateAsync(selected.id);
      toast.success(`Đã bỏ qua đồng bộ phiếu ${payloadText(selected, "requestNumber") || selected.defectId}`);
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
                          disabled={processing || skip.isPending}
                          title={processing ? "n8n đang xử lý sự kiện này" : "Không gửi sự kiện này sang Sheet"}
                          onClick={() => setSelected(item)}
                        >
                          <SkipForward className="h-4 w-4" />
                          Bỏ qua
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
        title="Bỏ qua lượt đồng bộ này?"
        description={selected
          ? `Phiếu ${payloadText(selected, "requestNumber") || selected.defectId} sẽ không được n8n ghi sang Google Sheet.`
          : undefined}
        confirmLabel="Bỏ qua đồng bộ"
        loading={skip.isPending}
        onConfirm={() => void confirmSkip()}
      >
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
