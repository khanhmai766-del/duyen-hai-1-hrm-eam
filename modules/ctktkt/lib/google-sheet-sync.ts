import { deriveDailyValuesFromCtktkt } from "./daily-source-links";
import type { CtktktDayEntries } from "./ctktkt-report";

export type DailyInputEntry = { fieldCode: string; value: string };

export type StoredPpaEntry = {
  ppaPlant: string | number;
  ppaS1: string | number;
  ppaS2: string | number;
  noteS1?: string | null;
  noteS2?: string | null;
};

export type GoogleSheetUnitPayload = {
  sanLuong: number | null;
  csKhaDung?: number | null;
  tinhHinhVanHanh: string;
  csBinhQuan: number | null;
  suatHaoThan: number | null;
  nhietTri: number | null;
  shnThucTe: number | null;
  shnPPA: number | null;
  chenhLech: string;
  danhGia: string;
};

export type GoogleSheetDayPayload = {
  date: string;
  row: number | null;
  S1: GoogleSheetUnitPayload;
  S2: GoogleSheetUnitPayload;
  NMND: GoogleSheetUnitPayload;
};

export type GoogleSheetAssessmentEntry = {
  row: number;
  iso: string;
  noteS1: string;
  noteS2: string;
};

export const PPA_AVAILABLE_CAPACITY_S1_CODE = "PPA_CSKD_S1";
export const PPA_AVAILABLE_CAPACITY_S2_CODE = "PPA_CSKD_S2";
export const PPA_OPERATING_EVENT_S1_CODE = "PPA_EVENT_S1";
export const PPA_OPERATING_EVENT_S2_CODE = "PPA_EVENT_S2";
export const GOOGLE_SHEET_VIEW_URL = "https://docs.google.com/spreadsheets/d/1L0NtMse98j0QBR2kjcK4E1Iob2XLDdrfNM99pBDBcyo/edit";

export function mergeCtktktLinkedDailyEntries(
  entries: DailyInputEntry[],
  current: CtktktDayEntries,
  previous?: CtktktDayEntries,
) {
  const merged = new Map(
    entries
      .filter(entry => !entry.fieldCode.startsWith("KTKT:"))
      .map(entry => [entry.fieldCode, entry.value]),
  );
  for (const [fieldCode, value] of Object.entries(deriveDailyValuesFromCtktkt(current, previous))) {
    merged.set(fieldCode, value);
  }
  return [...merged].map(([fieldCode, value]) => ({ fieldCode, value }));
}

export function parseAvailableCapacity(value: unknown, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) throw new Error(`${label} phải là số từ 0 đến 1.000 MW.`);
  return parsed;
}

const numberFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim().replace(/\s+/g, "");
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function divide(numerator: number | null, denominator: number | null, multiplier = 1) {
  return numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator * multiplier;
}

function differenceText(actual: number | null, ppa: number | null) {
  if (actual === null || ppa === null || ppa === 0) return "";
  const difference = actual - ppa;
  const percent = difference / ppa * 100;
  return `${difference >= 0 ? "+" : ""}${numberFormat.format(difference)} kJ/kWh (${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%)`;
}

function assessment(actual: number | null, ppa: number | null, note?: string | null) {
  if (actual === null || ppa === null) return "";
  const status = actual <= ppa ? "Đạt PPA" : "Không đạt PPA";
  const cleanNote = String(note || "").trim();
  if (/^(?:đạt|vượt|không đạt)(?:\s+ppa)?(?:\s|[-–—:]|$)/i.test(cleanNote)) return cleanNote;
  return cleanNote ? `${status} - ${cleanNote}` : status;
}

function required(value: number | null, label: string) {
  if (value === null) throw new Error(`Thiếu dữ liệu “${label}” của ngày đã chọn.`);
  return value;
}

export function buildGoogleSheetDayPayload(
  operatingDate: string,
  entries: DailyInputEntry[],
  ppa: StoredPpaEntry | null,
): GoogleSheetDayPayload {
  if (!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(operatingDate)) throw new Error("Ngày đồng bộ không hợp lệ.");
  if (!ppa) throw new Error("Ngày đã chọn chưa có kết quả PPA. Hãy đồng bộ và lưu kết quả PPA trước.");

  const values = new Map(entries.map(entry => [entry.fieldCode, entry.value]));
  const read = (code: string, label: string) => required(numeric(values.get(code)), label);
  const grossS1 = read("B", "Đầu cực S1"), netS1 = read("C", "Điểm bán S1"), hoursS1 = read("F", "Giờ phát S1");
  const grossS2 = read("H", "Đầu cực S2"), netS2 = read("I", "Điểm bán S2"), hoursS2 = read("L", "Giờ phát S2");
  const rawCoalS1 = read("AE", "Than tiêu thụ S1"), rawCoalS2 = read("AF", "Than tiêu thụ S2"), heatingValue = read("AJ", "Nhiệt trị");
  const coalS1 = numeric(values.get("AE_ADJ")) ?? rawCoalS1;
  const coalS2 = numeric(values.get("AF_ADJ")) ?? rawCoalS2;
  const availableCapacityS1 = required(parseAvailableCapacity(values.get(PPA_AVAILABLE_CAPACITY_S1_CODE), "Công suất khả dụng S1"), "Công suất khả dụng S1");
  const availableCapacityS2 = required(parseAvailableCapacity(values.get(PPA_AVAILABLE_CAPACITY_S2_CODE), "Công suất khả dụng S2"), "Công suất khả dụng S2");
  const operatingEventS1 = String(values.get(PPA_OPERATING_EVENT_S1_CODE) || "").trim();
  const operatingEventS2 = String(values.get(PPA_OPERATING_EVENT_S2_CODE) || "").trim();
  const ppaS1 = required(numeric(ppa.ppaS1), "SHN PPA S1"), ppaS2 = required(numeric(ppa.ppaS2), "SHN PPA S2"), ppaPlant = required(numeric(ppa.ppaPlant), "SHN PPA NMNĐ");

  const actualS1 = divide(coalS1 * heatingValue, netS1, 1 / 1000);
  const actualS2 = divide(coalS2 * heatingValue, netS2, 1 / 1000);
  const actualPlant = divide((coalS1 + coalS2) * heatingValue, netS1 + netS2, 1 / 1000);
  const grossPlantMwh = (grossS1 + grossS2) * 1000;
  const netPlant = netS1 + netS2;

  const unit = (
    sanLuong: number,
    csBinhQuan: number | null,
    suatHaoThan: number | null,
    actual: number | null,
    ppaValue: number,
    note?: string | null,
    availableCapacity?: number | null,
    netOutput?: number,
  ): GoogleSheetUnitPayload => ({
    sanLuong,
    csKhaDung: availableCapacity ?? null,
    tinhHinhVanHanh: "",
    csBinhQuan,
    suatHaoThan,
    nhietTri: heatingValue,
    shnThucTe: actual,
    shnPPA: netOutput === 0 ? null : ppaValue,
    chenhLech: differenceText(actual, ppaValue),
    danhGia: netOutput === 0 ? ["Ngừng máy — không đánh giá", String(note || "").trim()].filter(Boolean).join(" - ") : assessment(actual, ppaValue, note),
  });

  const [year, month, day] = operatingDate.split("-");
  return {
    date: `${Number(month)}/${Number(day)}/${year}`,
    row: null,
    S1: { ...unit(grossS1, divide(grossS1, hoursS1, 1000), divide(coalS1, netS1), actualS1, ppaS1, ppa.noteS1, availableCapacityS1, netS1), tinhHinhVanHanh: operatingEventS1 },
    S2: { ...unit(grossS2, divide(grossS2, hoursS2, 1000), divide(coalS2, netS2), actualS2, ppaS2, ppa.noteS2, availableCapacityS2, netS2), tinhHinhVanHanh: operatingEventS2 },
    NMND: unit(grossPlantMwh, divide(grossPlantMwh, hoursS1 + hoursS2), divide(coalS1 + coalS2, netPlant), actualPlant, ppaPlant, undefined, undefined, netPlant),
  };
}

export function validateGoogleAppsScriptUrl(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("URL Google Apps Script không hợp lệ."); }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
    throw new Error("Chỉ chấp nhận URL triển khai Google Apps Script dạng https://script.google.com/macros/s/.../exec.");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function resolveGoogleSheetRow(operatingDate: string, rows: unknown) {
  if (!Array.isArray(rows)) return null;
  const match = rows.find(item => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return row.iso === operatingDate;
  }) as Record<string, unknown> | undefined;
  const rowNumber = Number(match?.row);
  return Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : null;
}

export function confirmsGoogleSheetWrite(results: unknown, expectedRow: number) {
  if (!Array.isArray(results) || !Number.isInteger(expectedRow) || expectedRow < 1) return false;
  return results.some(item => {
    if (!item || typeof item !== "object") return false;
    const result = item as Record<string, unknown>;
    return result.status === "ok" && Number(result.row) === expectedRow;
  });
}

export function parseGoogleSheetAssessmentRows(rows: unknown): GoogleSheetAssessmentEntry[] {
  if (!Array.isArray(rows) || rows.length > 500) throw new Error("Danh sách đánh giá Google Sheet không hợp lệ.");
  const seen = new Set<string>();
  return rows.map(item => {
    if (!item || typeof item !== "object") throw new Error("Một dòng đánh giá Google Sheet không hợp lệ.");
    const value = item as Record<string, unknown>;
    const row = Number(value.row), iso = String(value.iso || "");
    const noteS1 = String(value.noteS1 || "").trim();
    const noteS2 = String(value.noteS2 || "").trim();
    if (!Number.isInteger(row) || row < 1 || !/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(iso) || seen.has(iso)) {
      throw new Error("Ngày hoặc số hàng đánh giá Google Sheet không hợp lệ.");
    }
    if (noteS1.length > 1000 || noteS2.length > 1000) throw new Error(`Đánh giá ngày ${iso} dài quá 1.000 ký tự.`);
    seen.add(iso);
    return { row, iso, noteS1, noteS2 };
  }).filter(item => item.noteS1 || item.noteS2);
}
