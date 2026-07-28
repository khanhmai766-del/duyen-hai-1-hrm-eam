"use client";

import * as React from "react";
import type { DefectSyncRun } from "@prisma/client";
import { RefreshCw, ChevronDown, CloudDownload, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDefectTwoWaySync, useSetDefectTwoWaySync } from "@/hooks/useDefects";
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

      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-4">
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

/** Cờ dự phòng đồng bộ hai chiều — cùng hook/API như bản banner cũ, chỉ đổi cách hiển thị. */
function TwoWaySyncRow() {
  const query = useDefectTwoWaySync();
  const setEnabled = useSetDefectTwoWaySync();
  const enabled = query.data?.data?.twoWaySyncEnabled ?? false;

  async function toggle() {
    try {
      await setEnabled.mutateAsync(!enabled);
      toast.success(!enabled ? "Đã bật đồng bộ hai chiều (dự phòng)" : "Đã tắt đồng bộ hai chiều");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-amber-900">Đồng bộ hai chiều (dự phòng)</div>
        <p className="mt-0.5 text-xs leading-snug text-amber-800/80">
          Dành cho giai đoạn sau. Hiện khiếm khuyết chỉ đồng bộ một chiều Google Sheet → DH1.
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={query.isLoading || setEnabled.isPending}
        title={enabled ? "Tắt đồng bộ hai chiều" : "Bật đồng bộ hai chiều"}
        aria-pressed={enabled}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60",
          enabled ? "bg-emerald-500" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
            enabled ? "translate-x-[18px]" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
