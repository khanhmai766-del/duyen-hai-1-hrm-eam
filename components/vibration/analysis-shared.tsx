"use client";

import * as React from "react";
import { LEVELS, STD_SHORT, type Level } from "@/lib/vibration/analysis/texts";
import { datedRecords } from "@/lib/vibration/analysis/engine";
import type { AnalysisDevice, AnalysisSettings } from "@/lib/vibration/analysis/types";
import { cn } from "@/lib/utils";

/** Dữ liệu chung truyền cho mọi tab của trang Phân tích độ rung. */
export interface AnalysisTabProps {
  devices: AnalysisDevice[];
  settings: AnalysisSettings;
  /** Cờ "Cả thiết bị lịch sử" (thanh công cụ của tab Tổng hợp / Chất lượng). */
  archived?: boolean;
  setArchived?: (v: boolean) => void;
}

const LEVEL_CLASS: Record<Level, string> = {
  na: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  watch: "bg-amber-50 text-amber-700 border-amber-200",
  plan: "bg-orange-50 text-orange-700 border-orange-200",
  soon: "bg-red-50 text-red-700 border-red-200",
  stop: "bg-red-600 text-white border-red-700",
};
export const LEVEL_DOT: Record<Level, string> = { na: "bg-slate-400", normal: "bg-emerald-500", watch: "bg-amber-500", plan: "bg-orange-500", soon: "bg-red-500", stop: "bg-red-700" };
export const LEVEL_TEXT: Record<Level, string> = { na: "text-slate-500", normal: "text-emerald-700", watch: "text-amber-700", plan: "text-orange-700", soon: "text-red-700", stop: "text-red-800" };

/** Huy hiệu mức hành động (vibration-analysis.js:levelBadge). */
export function LevelBadge({ level }: { level: Level | string; className?: string }) {
  const lv = (level in LEVELS ? level : "na") as Level;
  return <span className="lv-badge" data-level={lv}>{LEVELS[lv].label}</span>;
}

export const stdName = (id: string | null | undefined) => (id ? STD_SHORT[id] || id : "");

/** Chuỗi "x.y" kiểu Việt cho mm/s v.v. (đã có fmtN trong lib; đây chỉ là alias để import gọn ở UI). */
export { fmtN } from "@/lib/vibration/analysis/util";

/** Web độ rung cũ hiển thị ngày dạng yyyy-mm-dd (không đổi sang dd/mm/yyyy). */
export const vnDate = (d: string | null | undefined) => d || "—";

// ---------- Bộ lọc "Chọn dữ liệu phân tích": cương vị → hệ thống → thiết bị → lần đo (vibration-analysis.js:cataloguePanel) ----------
export interface CatalogueSel { area: string; system: string; deviceId: string; date: string }
export const EMPTY_SEL: CatalogueSel = { area: "", system: "", deviceId: "", date: "" };

const vi = (a: string, b: string) => a.localeCompare(b, "vi");
/** Thiết bị có ít nhất một lần đo có số (như catalogueDevices), lọc theo cương vị/hệ thống. */
export function catalogueDevices(devices: AnalysisDevice[], sel: Pick<CatalogueSel, "area" | "system">) {
  return devices.filter((d) => (!sel.area || d.area === sel.area) && (!sel.system || d.system === sel.system) && datedRecords(d).length > 0);
}

export function CataloguePanel({ devices, sel, onChange, showDevice = false, showDate = false, children, extra }: {
  devices: AnalysisDevice[];
  sel: CatalogueSel;
  onChange: (next: CatalogueSel) => void;
  showDevice?: boolean;
  showDate?: boolean;
  /** Công tắc phương pháp (methodSwitcher) — nằm ở đầu panel như web cũ. */
  children?: React.ReactNode;
  /** Nút bổ sung cuối hàng (In / lưu PDF). */
  extra?: React.ReactNode;
}) {
  const withData = React.useMemo(() => devices.filter((d) => datedRecords(d).length > 0), [devices]);
  const areas = React.useMemo(() => [...new Set(withData.map((d) => d.area).filter(Boolean))].sort(vi), [withData]);
  const systems = React.useMemo(() => [...new Set(withData.filter((d) => !sel.area || d.area === sel.area).map((d) => d.system).filter(Boolean))].sort(vi), [withData, sel.area]);
  const list = React.useMemo(() => catalogueDevices(devices, sel), [devices, sel]);
  const device = list.find((d) => d.id === sel.deviceId) ?? list[0];
  const dates = React.useMemo(() => (device ? [...new Set(datedRecords(device).map((r) => r.date as string))].reverse() : []), [device]);
  return (
    <section className="an-catalogue-panel" aria-label="Chọn dữ liệu phân tích">
      <div className="an-catalogue-top"><strong>Chọn dữ liệu phân tích</strong>{children}</div>
      <div className="an-catalogue-grid">
        <label className="an-filter-area">Cương vị
          <select value={sel.area} onChange={(e) => onChange({ area: e.target.value, system: "", deviceId: "", date: "" })}>
            <option value="">Tất cả cương vị</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></label>
        <label className="an-filter-system">Hệ thống
          <select value={sel.system} onChange={(e) => onChange({ ...sel, system: e.target.value, deviceId: "", date: "" })}>
            <option value="">Tất cả hệ thống</option>{systems.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></label>
        {showDevice && (
          <label className="an-filter-device">Thiết bị
            <select value={device?.id ?? ""} onChange={(e) => onChange({ ...sel, deviceId: e.target.value, date: "" })}>
              {list.map((d) => <option key={d.id} value={d.id}>{d.area} / {d.name} · {d.id}</option>)}
            </select></label>
        )}
        {showDate && (
          <label className="an-filter-date">Lần đo
            <select value={sel.date && dates.includes(sel.date) ? sel.date : dates[0] ?? ""} onChange={(e) => onChange({ ...sel, deviceId: device?.id ?? "", date: e.target.value })}>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select></label>
        )}
        {extra}
        <span className="an-filter-count">{list.length} thiết bị có số liệu</span>
      </div>
    </section>
  );
}

/** Thiết bị + ngày đang chọn từ CatalogueSel (mặc định thiết bị đầu / lần đo gần nhất). */
export function resolveSelection(devices: AnalysisDevice[], sel: CatalogueSel) {
  const list = catalogueDevices(devices, sel);
  const device = list.find((d) => d.id === sel.deviceId) ?? list[0] ?? null;
  if (!device) return { device: null, recs: [], record: null };
  const recs = datedRecords(device);
  const record = recs.filter((x) => x.date === sel.date).at(-1) ?? recs.at(-1) ?? null;
  return { device, recs, record };
}

/** Khung mục có tiêu đề (dùng cho các phần "1. Thông tin máy…"). */
export function Sec({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("an-sec", className)}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
/** Bảng cuộn ngang trên điện thoại (an-table-wrap > an-table). */
export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className="an-table-wrap"><table className={cn("an-table", className)}>{children}</table></div>;
}
export const Foot = ({ children }: { children: React.ReactNode }) => <p className="an-foot">{children}</p>;
export const Warn = ({ children }: { children: React.ReactNode }) => <p className="an-warn">{children}</p>;

/** Công tắc phương pháp ISO / Wowk (analysis-hub.js:methodSwitcher). */
export function MethodSwitcher({ method, onChange }: { method: "iso" | "wowk"; onChange: (m: "iso" | "wowk") => void }) {
  return (
    <div className="hub-method-switch" role="group" aria-label="Phương pháp phân tích">
      <span>Phương pháp</span>
      {([["iso", "ISO 20816-3", "tiêu chuẩn · RMS · vùng A–D"], ["wowk", "Tài liệu Wowk", "khi ISO thiếu thông tin · peak"]] as const).map(([k, l, s]) => (
        <button key={k} type="button" data-an-method={k} aria-pressed={method === k} onClick={() => onChange(k)}><b>{l}</b><small>{s}</small></button>
      ))}
    </div>
  );
}

/** Ngày dd/mm/yyyy (trang MILL cũ dùng dạng này). */
export const dmyDate = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
/** Bảng của trang MILL (ma-table > table). */
export function MaTable({ children }: { children: React.ReactNode }) {
  return <div className="ma-table"><table>{children}</table></div>;
}
