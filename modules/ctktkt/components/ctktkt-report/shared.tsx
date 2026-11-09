"use client";
// Hằng số, kiểu và hàm tiện ích dùng chung của trang Chỉ tiêu KTKT (tách từ ctktkt-report.tsx 09/11/2026).
import dynamic from "next/dynamic";
import { CTKTKT_BCSX_LINKED_CELLS } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { CTKTKT_WATER_LINKED_CELLS } from "@/modules/ctktkt/lib/ctktkt-water-link";
import { NH3_DCS_START_METER_CELLS, type CtktktDayEntries, type CtktktKpis } from "@/modules/ctktkt/lib/ctktkt-report";
import { parseLocaleNumber } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { CTKTKT_INPUT_FIELDS } from "@/modules/ctktkt/lib/ctktkt-fields.generated";
import { CTKTKT_EXTRA_INPUT_FIELDS, CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS } from "@/modules/ctktkt/lib/ctktkt-extra-fields";
import { PMIS_PRODUCTION_CELLS } from "@/modules/ctktkt/lib/ctktkt-pmis-sync";
import { CTKTKT_OPERATION_EVENTS_CELL, isCtktktOperationPowerCell, type CtktktOperationKind, type CtktktOperationUnit } from "@/modules/ctktkt/lib/ctktkt-operation-events";
import { describeCtktktMissingField } from "@/modules/ctktkt/lib/data-completeness";

export const CtktktEmailModal=dynamic(()=>import("@/modules/ctktkt/components/ctktkt-email-modal").then(module=>module.CtktktEmailModal),{ssr:false});
export const CoalMeterPhotoImport=dynamic(()=>import("@/modules/ctktkt/components/coal-meter-photo-import").then(module=>module.CoalMeterPhotoImport),{ssr:false});
export const CoalMeterPhotoReview=dynamic(()=>import("@/modules/ctktkt/components/coal-meter-photo-review").then(module=>module.CoalMeterPhotoReview),{ssr:false});

export type LoadedEntry = { operatingDate: string; cell: string; value: string };
export type LinkWarning = { operatingDate: string; cell: string; message: string };

export type MainTab =
  | "tkd_dcs"
  | "unit_meters"
  | "steam_nh3"
  | "td21_coal_blend"
  | "startup_shutdown"
  | "pmis_reports"
  | "all_fields";

export const LEGACY_OPERATION_EVENT_CELLS = new Set([
  "STARTUP_UNIT", "STARTUP_EVENT", "STARTUP_OIL_START_TIME", "STARTUP_GRID_SYNC_TIME", "STARTUP_MIN_LOAD_TIME", "STARTUP_MIN_LOAD_MW",
  "C87", "D87", "E87", "F87", "G87", "H87", "C88", "D88", "E88", "F88", "G88", "H88",
  "C93", "D93", "E93", "F93", "G93", "H93", "C94", "D94", "E94", "F94", "G94", "H94",
]);

export const STARTUP_UNITS: Array<{ value: CtktktOperationUnit; label: string }> = [
  { value: "S1", label: "Tổ máy S1" },
  { value: "S2", label: "Tổ máy S2" },
];

export const OPERATION_KINDS: Array<{ value: CtktktOperationKind; label: string }> = [
  { value: "startup", label: "Khởi động" },
  { value: "shutdown", label: "Ngừng tổ máy" },
  { value: "incident_oil", label: "Đốt dầu sự cố" },
];

export const QLKT_PRODUCTION_CELLS = new Set<string>(PMIS_PRODUCTION_CELLS);

export const editableFields = [
  ...CTKTKT_INPUT_FIELDS.filter(
    field => !CTKTKT_BCSX_LINKED_CELLS.has(field.cell)
      && !CTKTKT_WATER_LINKED_CELLS.has(field.cell)
      && !NH3_DCS_START_METER_CELLS.has(field.cell)
      && !CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS.has(field.cell),
  ),
  ...CTKTKT_EXTRA_INPUT_FIELDS,
].filter(field => field.cell !== CTKTKT_OPERATION_EVENTS_CELL
  && !LEGACY_OPERATION_EVENT_CELLS.has(field.cell)
  && !isCtktktOperationPowerCell(field.cell)
  && describeCtktktMissingField(field) !== null);

export const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });

export function reportTabClass(active: boolean) {
  return `flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-center text-xs font-semibold leading-tight transition-all ${
    active
      ? "border-[#765038] bg-[#8a6247] text-white shadow-sm"
      : "border-[#d9c3ad] bg-[#f4eadf] text-[#68462e] hover:border-[#b99472] hover:bg-[#ead9c8]"
  }`;
}

export const metricRows: Array<{ key: keyof CtktktKpis; label: string; unit: string }> = [
  { key: "grossMwh", label: "Điện đầu cực", unit: "MWh" },
  { key: "netMwh", label: "Điện giao", unit: "MWh" },
  { key: "auxiliaryMwh", label: "Điện tự dùng", unit: "MWh" },
  { key: "auxiliaryPercent", label: "Tỷ lệ tự dùng gồm tổn thất MBA", unit: "%" },
  { key: "rawCoalTonnes", label: "Than chưa quy ẩm", unit: "tấn" },
  { key: "adjustedCoalTonnes", label: "Than quy ẩm 8,5%", unit: "tấn" },
  { key: "hhvKjKg", label: "Nhiệt trị than quy ẩm 8,5%", unit: "kJ/kg" },
  { key: "netCoalRate", label: "Suất hao than tinh", unit: "g/kWh" },
  { key: "netHeatRate", label: "Suất hao nhiệt tinh", unit: "kJ/kWh" },
];

export const meterComparisonKeys = new Set<keyof CtktktKpis>([
  "grossMwh",
  "netMwh",
  "auxiliaryMwh",
  "auxiliaryPercent",
  "rawCoalTonnes",
  "hhvKjKg",
  "adjustedCoalTonnes",
  "netCoalRate",
  "netHeatRate",
]);

export function format(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return numberFormat.format(value);
}

export function coalConsumptionCellClass(value: number | null, total = false) {
  if (value !== null && value < 0) return "bg-red-50 text-red-700 font-black";
  return total ? "bg-blue-50 text-blue-950 font-black" : "bg-sky-50/60 text-slate-900 font-bold";
}

export function parseDeminNum(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const cleaned = val.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatDeminDiff(
  xVal: string | undefined,
  wVal: string | undefined,
  adjVal?: string | undefined,
): string {
  const x = parseDeminNum(xVal);
  const w = parseDeminNum(wVal);
  const adj = parseDeminNum(adjVal) ?? 0;
  if (x === null || w === null) return "—";
  return numberFormat.format(x - w + adj);
}

export function formatDeminTotal(
  x1: string | undefined,
  w1: string | undefined,
  adj1: string | undefined,
  x2: string | undefined,
  w2: string | undefined,
  adj2: string | undefined,
): string {
  const nx1 = parseDeminNum(x1);
  const nw1 = parseDeminNum(w1);
  const nadj1 = parseDeminNum(adj1) ?? 0;
  const nx2 = parseDeminNum(x2);
  const nw2 = parseDeminNum(w2);
  const nadj2 = parseDeminNum(adj2) ?? 0;

  const diff1 = nx1 !== null && nw1 !== null ? nx1 - nw1 + nadj1 : null;
  const diff2 = nx2 !== null && nw2 !== null ? nx2 - nw2 + nadj2 : null;

  if (diff1 === null && diff2 === null) return "—";
  const total = (diff1 ?? 0) + (diff2 ?? 0);
  return numberFormat.format(total);
}

export function formatAdjTotal(adj1: string | undefined, adj2: string | undefined): string {
  const a1 = parseDeminNum(adj1);
  const a2 = parseDeminNum(adj2);
  if (a1 === null && a2 === null) return "0";
  return numberFormat.format((a1 ?? 0) + (a2 ?? 0));
}

export function formatResinTotal(z1: string | undefined, z2: string | undefined): string {
  const nz1 = parseDeminNum(z1);
  const nz2 = parseDeminNum(z2);
  if (nz1 === null && nz2 === null) return "—";
  const total = (nz1 ?? 0) + (nz2 ?? 0);
  return numberFormat.format(total);
}

export function num(entries: CtktktDayEntries, cell: string): number | null {
  return parseLocaleNumber(entries[cell] || "");
}
