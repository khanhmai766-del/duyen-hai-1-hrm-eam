"use client";

import { History, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HcActivityLog } from "@/hooks/useHcAttendance";
import { cn } from "@/lib/utils";

const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const LABELS: Record<string, string> = {
  HC_REGISTER: "Đăng ký đi hành chính",
  HC_REGISTER_RESUBMIT: "Đăng ký lại đi hành chính",
  HC_NOTE_UPDATE: "Cập nhật nội dung công việc",
  HC_REGISTER_CANCEL: "Hủy đăng ký",
  HC_REGISTER_APPROVE: "Duyệt đăng ký",
  HC_REGISTER_REJECT: "Không duyệt đăng ký",
};

function activityTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function RegistrationActivityDrawer({ open, onOpenChange, date, logs, loading, refreshing, onRefresh }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  logs: HcActivityLog[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const dateLabel = date.split("-").reverse().join("/");
  return <>
    {open && <button type="button" className="fixed inset-0 z-40 cursor-default bg-slate-950/25 backdrop-blur-[1px]" aria-label="Đóng nhật ký đăng ký" onClick={() => onOpenChange(false)} />}
    <aside aria-hidden={!open} className={cn("fixed inset-y-0 right-0 z-50 flex w-[min(92vw,430px)] flex-col bg-white shadow-[-16px_0_40px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out", open ? "translate-x-0" : "pointer-events-none translate-x-full")}>
      <div className="flex items-start justify-between gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><History className="h-4 w-4" /></span>
          <div className="min-w-0"><div className="font-semibold text-ink">Nhật ký đăng ký đi hành chính</div><div className="mt-0.5 text-xs text-muted-foreground">Hoạt động ngày {dateLabel}</div></div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Đóng"><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <span className="text-xs text-muted-foreground">Lưu cả đăng ký đã bị hủy khỏi danh sách</span>
        <Button type="button" size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing}><RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Làm mới</Button>
      </div>
      {loading ? <div className="flex flex-1 items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải nhật ký...</div>
      : logs.length === 0 ? <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">Chưa có hoạt động đăng ký đi hành chính nào trong ngày này.</div>
      : <div className="flex-1 divide-y divide-sky-100 overflow-y-auto">{logs.map((log) => <div key={log.id} className="relative ml-8 border-l border-sky-200 px-5 py-4 transition-colors hover:bg-sky-50/60">
          <span className="absolute -left-1.5 top-5 h-3 w-3 rounded-full border-2 border-white bg-sky-500 ring-1 ring-sky-200" />
          <div className="flex items-center justify-between gap-3"><div className="min-w-0 truncate text-sm font-semibold text-ink">{log.user?.name ?? "Không xác định"}</div><time className="shrink-0 font-mono text-[11px] font-semibold text-sky-700">{activityTime(log.createdAt)}</time></div>
          <div className="mt-1"><div className="text-sm font-medium text-ink">{LABELS[log.action] ?? log.action}</div>{log.detail && <div className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{log.detail}</div>}</div>
        </div>)}</div>}
    </aside>
  </>;
}
