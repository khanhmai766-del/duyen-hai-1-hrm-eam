"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, FileClock, PackageCheck, Wrench } from "lucide-react";
import type { PendingReplacementSettlement } from "@/hooks/useReplacements";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  SU_DUNG_VAT_TU: "Chờ xác nhận sử dụng vật tư",
  CHO_NGHIEM_THU: "Chờ nghiệm thu",
  CHO_THONG_KE_XUAT_BIEN_BAN: "Chờ Thống kê xuất biên bản",
  CHO_QUYET_TOAN: "Chờ xác nhận quyết toán",
  NHAN_VAT_TU: "Chờ nhận vật tư",
  CHO_PHIEU_YCSC: "Chờ gắn SYC",
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function PendingReplacementSettlements({
  rows,
  capped = false,
}: {
  rows: PendingReplacementSettlement[];
  capped?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-[linear-gradient(145deg,#fffdf7_0%,#fff8e8_100%)] shadow-[0_14px_38px_-30px_rgba(180,83,9,0.65)]">
      <div className="flex flex-col gap-3 border-b border-amber-200/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-200">
            <FileClock className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.08em] text-amber-950">Chờ quyết toán</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                {rows.length}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-amber-800/80">
              SYC vật tư đã xử lý nhưng phiếu vật tư chưa khóa khối lượng thực dùng. Hồ sơ sẽ tự chuyển xuống lịch sử chính sau khi quyết toán.
            </p>
          </div>
        </div>
        {capped && (
          <span className="rounded-lg border border-amber-200 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
            Danh sách đang chạm giới hạn tải
          </span>
        )}
      </div>

      <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2">
        {rows.map((row) => {
          const materials = unique(row.points.map((point) => `${point.material.code} · ${point.material.name}`));
          const devices = unique(row.points.map((point) => point.device?.name ?? point.location ?? point.deviceSeq));
          const machines = unique(row.points.map((point) => point.material.machine ?? point.machine));
          const processedAt = row.history?.performedAt ?? row.defectCompletedAt;
          const stageLabel = STATUS_LABELS[row.ticketStatus] ?? row.ticketStatus;

          return (
            <article key={row.ticketId} className="group rounded-xl border border-amber-200/90 bg-white/90 p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] font-bold text-white">
                      <Wrench className="h-3 w-3" /> SYC {row.requestNumber ?? "chưa có số"}
                    </span>
                    {machines.map((machine) => (
                      <span key={machine} className="rounded-md bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 ring-1 ring-sky-100">
                        {machine}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[13px] font-bold text-slate-900">{row.ticketNumber}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{row.assignedPosition}</div>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                  {stageLabel}
                </span>
              </div>

              <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <PackageCheck className="h-3.5 w-3.5" /> Vật tư
                  </div>
                  <div className="mt-1 space-y-1 text-xs font-semibold leading-relaxed text-slate-700">
                    {materials.slice(0, 2).map((material) => <div key={material} className="line-clamp-2">{material}</div>)}
                    {materials.length > 2 && <div className="text-slate-500">+{materials.length - 2} vật tư khác</div>}
                  </div>
                </div>
                <div className="min-w-0 border-t border-slate-200 pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Thiết bị / điểm thay thế</div>
                  <div className="mt-1 space-y-1 text-xs leading-relaxed text-slate-600">
                    {devices.slice(0, 2).map((device) => <div key={device} className="line-clamp-2">{device}</div>)}
                    {devices.length > 2 && <div>+{devices.length - 2} điểm khác</div>}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-amber-200 pt-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-amber-600" /> Xử lý {formatDate(processedAt)}</span>
                  {row.history?.status === "PENDING" && row.history.finalizeAt && (
                    <span className="font-medium text-amber-700">SYC tự chốt {formatDate(row.history.finalizeAt)}</span>
                  )}
                  {row.pctNumber && <span>PCT/LCT <b className="font-mono text-slate-700">{row.pctNumber}</b></span>}
                </div>
                <Link
                  href="/replacement-procedures"
                  className="inline-flex shrink-0 items-center gap-1 font-bold text-amber-800 transition hover:text-amber-950 hover:underline"
                >
                  Mở quy trình vật tư <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
