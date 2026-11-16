"use client";

import { ArrowRight, AlertTriangle, CalendarClock, DoorOpen, Layers, Lightbulb } from "lucide-react";
import type { LightSummaryRow } from "@/hooks/usePccc";
import type { PcccOverviewDrill } from "./PcccOverview";
import { fmtPercent } from "./pccc-shared";
import { LIGHT_KHONG_CO_DEN, TINH_TRANG_CHUA_CAP_NHAT } from "@/lib/pccc-status";
import { cn } from "@/lib/utils";

export function PcccLightingOverview({ rows, onDrill }: {
  rows: LightSummaryRow[];
  onDrill?: (target: PcccOverviewDrill) => void;
}) {
  return (
    <section aria-labelledby="pccc-lighting-title">
      <div className="mb-5 border-l-4 border-teal-600 pl-3.5">
        <h3 id="pccc-lighting-title" className="text-xl font-bold tracking-tight text-navy">Chiếu sáng & thoát nạn</h3>
        <p className="mt-1 text-sm text-slate-600">Theo dõi riêng đèn chỉ dẫn và đèn chiếu sáng khi mất điện</p>
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        {(["EXIT", "CSSC"] as const).map((loai, index) => {
          const row = rows.find((item) => item.loai === loai);
          // Vị trí không lắp đèn không nằm trong mẫu số kiểm tra.
          const installed = (row?.tongSo ?? 0) - (row?.khongCoDen ?? 0);
          const ratio = installed > 0 ? (row?.dat ?? 0) / installed : null;
          const percent = ratio === null ? 0 : Math.max(0, Math.min(100, ratio * 100));
          const Icon = loai === "EXIT" ? DoorOpen : Lightbulb;
          const title = loai === "EXIT" ? "Đèn EXIT" : "Đèn chiếu sáng sự cố";
          const go = (tinhTrang: string) => onDrill?.({ bang: "DEN", loai, tinhTrang });
          const statuses = [
            { label: "Không đạt", value: row?.khongDat ?? 0, status: "Không đạt", icon: AlertTriangle, color: "text-rose-700", hint: "Đèn cần xử lý" },
            { label: "Không có đèn", value: row?.khongCoDen ?? 0, status: LIGHT_KHONG_CO_DEN, icon: Layers, color: "text-slate-600", hint: "Vị trí chưa lắp đèn" },
            { label: "Chưa cập nhật", value: row?.chuaCapNhat ?? 0, status: TINH_TRANG_CHUA_CAP_NHAT, icon: CalendarClock, color: "text-amber-700", hint: "Chưa có kết quả kiểm tra" },
          ];
          return (
            <section key={loai} aria-labelledby={`lighting-${loai}`} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", loai === "EXIT" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700")}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Hệ thống {index === 0 ? "VI" : "VII"}</p>
                  <h4 id={`lighting-${loai}`} className="mt-0.5 text-base font-bold text-navy">{title}</h4>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-slate-50/70 px-5 py-6 sm:gap-6">
                <div className="relative size-28 shrink-0 sm:size-32" role="img" aria-label={`${fmtPercent(ratio, 0)} đèn đã lắp đạt yêu cầu`}>
                  <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
                    <circle cx="60" cy="60" r="51" fill="none" stroke="#e2e8f0" strokeWidth="9" />
                    <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="9" pathLength="100" strokeDasharray={`${percent} 100`} className={ratio === null ? "text-slate-300" : ratio >= 0.9 ? "text-emerald-600" : ratio >= 0.7 ? "text-amber-500" : "text-rose-500"} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[28px] font-bold leading-none tracking-tight tabular-nums text-navy sm:text-[32px]">{fmtPercent(ratio, 0)}</span>
                    <span className="mt-1 text-[11px] text-slate-600">Tỷ lệ đạt</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!onDrill}
                  onClick={() => go("Đạt")}
                  aria-label={`${title}: xem ${row?.dat ?? 0} đèn đạt`}
                  className="group min-w-0 rounded-lg text-left outline-none hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-4 disabled:cursor-default"
                >
                  <span className="block text-[30px] font-bold leading-none tracking-tight tabular-nums text-emerald-700 sm:text-[38px]">{row?.dat ?? 0}<span className="ml-1.5 text-lg font-medium text-slate-500">/ {installed}</span></span>
                  <span className="mt-2 block text-sm font-semibold text-navy">Đèn đạt yêu cầu</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">trên số đèn đã lắp</span>
                  {onDrill && <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:underline">Xem danh sách <ArrowRight className="size-3.5" /></span>}
                </button>
              </div>
              <div className="divide-y divide-slate-100 px-5">
                {statuses.map((status) => (
                  <button
                    key={status.status}
                    type="button"
                    disabled={!onDrill}
                    onClick={() => go(status.status)}
                    aria-label={`${title}: xem ${status.value} vị trí ${status.label.toLowerCase()}`}
                    className="group flex min-h-16 w-full items-center gap-3 py-3 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 disabled:cursor-default"
                  >
                    <status.icon className={cn("size-4 shrink-0", status.color)} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-navy">{status.label}</span>
                      <span className="block text-xs leading-5 text-slate-500">{status.hint}</span>
                    </span>
                    <span className={cn("text-xl font-bold tabular-nums", status.color)}>{status.value}</span>
                    {onDrill && <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-navy" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-600">
                <span>Tổng vị trí quản lý <b className="ml-1 tabular-nums text-navy">{row?.tongSo ?? 0}</b></span>
                <span>{installed} vị trí đã lắp đèn</span>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
