"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, History, Loader2, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDefects, type DefectItem } from "@/hooks/useDefects";
import { useDefectHistory, type DefectHistoryItem } from "@/hooks/useDefectHistory";
import { cn, formatDate } from "@/lib/utils";

type DeviceDefectHistoryProps = {
  deviceSeq: string;
  deviceName: string;
  deviceCode?: string | null;
  mappedUnit?: string | null;
};

export function DeviceDefectHistory(props: DeviceDefectHistoryProps) {
  return (
    <>
      <aside className="hidden min-h-0 w-[52%] shrink-0 border-r border-slate-200 bg-slate-50/80 xl:flex xl:flex-col">
        <HistoryContent {...props} />
      </aside>
      <div className="px-5 pt-4 xl:hidden">
        <MobileHistory {...props} />
      </div>
    </>
  );
}

function MobileHistory(props: DeviceDefectHistoryProps) {
  const active = useDefects({ deviceSeq: props.deviceSeq, mappedUnit: props.mappedUnit ?? undefined, limit: 20 });
  const history = useDefectHistory({ deviceSeq: props.deviceSeq, mappedUnit: props.mappedUnit ?? undefined, limit: "20" });
  const activeCount = active.data?.meta.total ?? 0;
  const historyCount = history.data?.meta.total ?? 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-left shadow-sm"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-200">
            <History className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">Lịch sử thiết bị</span>
            <span className="block truncate text-xs text-slate-600">
              {active.isLoading || history.isLoading ? "Đang kiểm tra…" : `${activeCount} đang tồn tại · ${historyCount} đã xử lý`}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </DialogTrigger>
      <DialogContent className="h-[92dvh] w-[calc(100vw-1rem)] max-w-none overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="sr-only"><DialogTitle>Lịch sử khiếm khuyết thiết bị</DialogTitle></DialogHeader>
        <HistoryContent {...props} />
      </DialogContent>
    </Dialog>
  );
}

function HistoryContent({ deviceSeq, deviceName, deviceCode, mappedUnit }: DeviceDefectHistoryProps) {
  const active = useDefects({ deviceSeq, mappedUnit: mappedUnit ?? undefined, limit: 20 });
  const history = useDefectHistory({ deviceSeq, mappedUnit: mappedUnit ?? undefined, limit: "20" });
  const activeRows = active.data?.data ?? [];
  const historyRows = history.data?.data ?? [];
  const loading = active.isLoading || history.isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#fff_30%)]">
      <div className="shrink-0 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy text-white shadow-sm">
            <History className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Lịch sử khiếm khuyết</p>
            <h3 className="mt-0.5 truncate text-base font-bold text-slate-950" title={deviceName}>{deviceName}</h3>
            <p className="mt-0.5 truncate font-mono text-xs text-sky-700">{deviceCode || deviceSeq}</p>
          </div>
        </div>
        {!loading && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Summary label="Đang tồn tại" value={active.data?.meta.total ?? activeRows.length} alert />
            <Summary label="Đã xử lý gần đây" value={historyRows.length} />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử thiết bị…
          </div>
        ) : active.isError || history.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Không tải được lịch sử thiết bị. Anh/chị vẫn có thể tiếp tục ra phiếu.
          </div>
        ) : activeRows.length === 0 && historyRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 font-semibold text-slate-900">Chưa ghi nhận khiếm khuyết trước đây</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Thiết bị này chưa có phiếu đang tồn tại hoặc lịch sử sửa chữa.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {activeRows.length > 0 && (
              <HistoryGroup title="Phiếu đang tồn tại" count={active.data?.meta.total ?? activeRows.length} tone="alert">
                {activeRows.map((row) => <ActiveRow key={row.id} row={row} />)}
              </HistoryGroup>
            )}
            {historyRows.length > 0 && (
              <HistoryGroup title="Lịch sử đã xử lý" count={historyRows.length}>
                {historyRows.map((row) => <CompletedRow key={row.id} row={row} />)}
              </HistoryGroup>
            )}
          </div>
        )}
      </div>
      <p className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 text-[11px] leading-relaxed text-slate-500">
        Đối chiếu nội dung và kết quả sửa chữa trước khi lập phiếu mới để nhận biết khiếm khuyết tái diễn.
      </p>
    </div>
  );
}

function Summary({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", alert && value > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white")}>
      <p className={cn("text-xl font-extrabold tabular-nums", alert && value > 0 ? "text-red-600" : "text-slate-900")}>{value}</p>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

function HistoryGroup({ title, count, tone, children }: { title: string; count: number; tone?: "alert"; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        {tone === "alert" ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <Wrench className="h-4 w-4 text-emerald-600" />}
        <h4 className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">{title}</h4>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ActiveRow({ row }: { row: DefectItem }) {
  return (
    <article className="rounded-xl border border-red-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-red-700">{row.requestNumber || "Chưa có STT"}</span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Đang tồn tại</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug text-slate-900">{row.content || "Chưa có nội dung"}</p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Phát hiện {formatDate(row.detectedAt || row.createdAt)}</p>
    </article>
  );
}

function CompletedRow({ row }: { row: DefectHistoryItem }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" className="w-full p-3 text-left hover:bg-slate-50" onClick={() => setExpanded((value) => !value)}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-900">{row.requestNumber || row.workOrderNumber || "Phiếu lịch sử"}</span>
          <span className="text-[11px] text-slate-500">{formatDate(row.performedAt)}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-slate-800">{row.defectContent || "Không có nội dung khiếm khuyết"}</p>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-emerald-50/35 px-3 py-3 text-xs leading-relaxed">
          <p><b className="text-slate-700">Nội dung thực hiện:</b> <span className="text-slate-600">{row.content || "—"}</span></p>
          <p><b className="text-slate-700">Kết quả:</b> <span className="text-slate-600">{row.result || "—"}</span></p>
          {row.workOrderNumber && <p><b className="text-slate-700">Phiếu công tác:</b> <span className="text-slate-600">{row.workOrderNumber}</span></p>}
        </div>
      )}
    </article>
  );
}
