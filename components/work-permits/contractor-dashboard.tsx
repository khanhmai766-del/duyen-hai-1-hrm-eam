"use client";

import { History } from "lucide-react";
import type { PermitCompanySummary } from "@/hooks/useWorkPermits";

/** Tỷ lệ tham gia: người làm việc trong ngày / nhân sự đang hoạt động (danh bạ, bỏ người đã ngừng). */
export function participationRate(workingToday: number, active: number) {
  return active > 0 ? workingToday / active : 0;
}
const percent = (value: number) => `${(value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

/**
 * Dashboard đầu tab "Nhân sự nhà thầu" (theo nhóm Đại tu / SCTX đang chọn): các ô tổng giống tab DASHBOARD của
 * Google Sheets thẻ ra vào cổng, cộng thêm số người làm việc trong ngày — số mà Sheet không có (lấy từ quét vào/ra PCT).
 *
 * Tổng "làm việc trong ngày" lấy từ máy chủ (mỗi người chỉ tính một lần trên mọi đơn vị), không cộng các dòng.
 * Người làm việc không có hồ sơ trong danh bạ vẫn được đếm nên tỷ lệ có thể vượt 100% — giữ nguyên số, chỉ chặn thanh.
 */
export function ContractorDashboard({ rows, workingToday, workingDay, scopeLabel, onOpenHistory }: { rows: PermitCompanySummary[]; workingToday: number; workingDay?: string; scopeLabel: string;
  /** Mở lịch sử theo ngày; truyền tên đơn vị để mở sẵn đơn vị đó. */
  onOpenHistory?: (company?: string) => void }) {
  const sum = (key: "active" | "cardsValid" | "cardsExpired" | "trained" | "total") => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const active = sum("active"), total = sum("total");
  const rate = participationRate(workingToday, active);
  const byCompany = rows.filter(row => row.active > 0)
    .map(row => ({ row, rate: participationRate(row.workingToday ?? 0, row.active) }))
    .sort((a, b) => b.rate - a.rate || b.row.active - a.row.active);
  const tiles = [
    { label: "Đang hoạt động", value: active, note: total > active ? `${total - active} ngừng hoạt động` : `${total} trong danh bạ`, tone: "text-ink" },
    { label: "Thẻ còn hạn", value: sum("cardsValid"), note: total ? `${percent(sum("cardsValid") / total)} danh bạ` : "", tone: "text-emerald-700" },
    { label: "Thẻ hết hạn", value: sum("cardsExpired"), note: sum("cardsExpired") ? "cần gia hạn" : "không có", tone: sum("cardsExpired") ? "text-red-700" : "text-slate-500" },
    { label: "Đã HL ATVSLĐ", value: sum("trained"), note: total ? `${percent(sum("trained") / total)} danh bạ` : "", tone: "text-sky-700" },
  ];
  return <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label={`Tổng quan nhân sự nhà thầu ${scopeLabel}`}>
    <div className="grid gap-px bg-border lg:grid-cols-[minmax(340px,auto)_1fr]">
      {/* Ô chính: tỷ lệ tham gia làm việc trong ngày. */}
      <div className="flex items-center gap-4 bg-card p-4">
        <Ring value={rate} />
        <div className="min-w-0">
          <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Làm việc trong ngày{workingDay ? ` ${workingDay}` : ""}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums leading-none text-blue-800">{percent(rate)}</p>
          <p className="mt-1.5 whitespace-nowrap text-sm text-muted-foreground"><b className="text-foreground">{workingToday}</b> / {active} người đang hoạt động</p>
          {onOpenHistory && <button type="button" onClick={() => onOpenHistory()} className="-ml-1 mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><History size={14} aria-hidden />Xem lịch sử theo ngày</button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">{tiles.map(tile => <div key={tile.label} className="bg-card px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums leading-none ${tile.tone}`}>{tile.value}</p>
        {tile.note && <p className="mt-1 text-[11px] text-muted-foreground">{tile.note}</p>}
      </div>)}</div>
    </div>
    {byCompany.length > 0 && <div className="border-t border-border px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tỷ lệ tham gia theo đơn vị</h3>
      <ul className="mt-2 grid gap-x-8 gap-y-0.5 lg:grid-cols-2">{byCompany.map(({ row, rate: value }) => {
        const title = `${row.company}: ${row.workingToday ?? 0} / ${row.active} người đang hoạt động`;
        const content = <>
          <span className="truncate font-semibold text-blue-800">{row.code || row.company}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, value * 100)}%` }} /></span>
          <span className="min-w-28 whitespace-nowrap text-right tabular-nums text-muted-foreground"><b className="text-foreground">{percent(value)}</b> · {row.workingToday ?? 0}/{row.active}</span>
        </>;
        const grid = "grid w-full grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-xs";
        // Bấm một đơn vị → lịch sử theo ngày của đơn vị đó.
        return <li key={row.company}>{onOpenHistory
          ? <button type="button" className={`${grid} min-h-10 rounded-md sm:min-h-7 text-left hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`} title={`${title} — bấm để xem lịch sử theo ngày`} onClick={() => onOpenHistory(row.company)}>{content}</button>
          : <div className={grid} title={title}>{content}</div>}</li>;
      })}</ul>
    </div>}
  </section>;
}

function Ring({ value }: { value: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
    <circle cx="32" cy="32" r={r} fill="none" strokeWidth="8" className="stroke-slate-100" />
    {/* 0% thì không vẽ cung — đầu tròn của nét vẫn hiện thành một chấm. */}
    {value > 0 && <circle cx="32" cy="32" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-blue-600" strokeDasharray={`${Math.min(1, value) * c} ${c}`} />}
  </svg>;
}
