import { calculateAuxiliaryElectricity } from "./auxiliary-electricity";

// Shared constants + Excel-export builder for the "Nhập liệu BCSX" module.
//
// Context: trưởng ca (shift lead) currently retypes the same half-hourly P/Q
// readings and the daily operating-event log by hand into 3 near-identical
// Excel files every day (BCSX_NMD_A0/S1/S2 — sent to Điều độ NSMO). This module
// lets them type it once on the web (per unit S1/S2 — A0 = tổng nhà máy is
// always S1+S2, computed, never entered separately) and export files that
// match the original template layout exactly, so the receiving side's
// workflow (open the file, forward by email) does not change.
//
// The 4 end-of-day totals (Sản lượng đầu cực/thương phẩm/than tiêu thụ, than
// tồn kho) live in `daily_inputs`, reusing the existing QLKT-sync field codes
// (B/C/AE for S1, H/I/AF for S2, AR for than tồn kho, shared across units) —
// same codes the "/" page already syncs/edits, entering them here or there
// writes to the same place. The user intends to wire a QLKT auto-sync
// specifically for this page once they confirm the exact source screen; until
// then these are plain editable inputs. "Tự dùng" = đầu cực - thương phẩm
// (computed, matches the source workbook's own formula, never entered).
//
// "Tình hình vận hành" (operating-event log) is imported directly from the
// completed-dispatch-command workbook. The web app saves S1/S2 immediately and
// generates the five-column DH1 workbook for upload to QLKT; manual editing
// remains available for review and exceptional events.
//
// A0 (tổng nhà máy) rules, per explicit user instruction (20/09/2026):
//   - Mục 1 (48 điểm nửa giờ): P/Q/P điểm bán cộng S1+S2 tại từng ô.
//     Riêng Utc 220 kV là điện áp thanh cái dùng chung nên luôn lấy S1, bỏ qua S2.
//   - Mục 2 (5 số tổng ngày): tổng S1+S2 — NGOẠI TRỪ than tồn kho, là 1 kho
//     dùng chung cho cả nhà máy (không cộng đôi) — người dùng xác nhận 17/09/2026.
//   - Mục 3 (nhật ký sự kiện): các dòng của S1 đứng trước, S2 tiếp theo sau —
//     KHÔNG sắp xếp lại theo thời gian.

export type Unit = "S1" | "S2";
export type ExportUnit = Unit | "A0";

// 48 points: 47 half-hour points from 00:30 through 23:30, plus the final
// "23:59" end-of-day point —
// verified against the real BCSX_NMD_S1_16.09.2026.xlsx column A (rows 11-58).
export const SHIFT_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let minutes = 30; minutes < 24 * 60; minutes += 30) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  slots.push("23:59");
  return slots;
})();

export type ShiftMetric = "P" | "Q" | "D" | "E";
export const SHIFT_METRICS: { key: ShiftMetric; label: string; col: "B" | "C" | "D" | "E" }[] = [
  { key: "P", label: "Tổng P (MW) đầu cực máy phát", col: "B" },
  { key: "Q", label: "Tổng Q (MVAr) đầu cực máy phát", col: "C" },
  { key: "D", label: "Tổng P (MW) điểm bán điện", col: "D" },
  { key: "E", label: "Điện áp thanh cái (kV)", col: "E" },
];

function sumMaybe(a: number | null, b: number | null) {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

export function deriveA0Readings(
  s1: Partial<Record<ShiftMetric, (number | null)[]>>,
  s2: Partial<Record<ShiftMetric, (number | null)[]>>,
): Partial<Record<ShiftMetric, (number | null)[]>> {
  const readings: Partial<Record<ShiftMetric, (number | null)[]>> = {};
  for (const metric of SHIFT_METRICS) {
    readings[metric.key] = SHIFT_TIME_SLOTS.map((_, index) => {
      const s1Value = s1[metric.key]?.[index] ?? null;
      if (metric.key === "E") return s1Value;
      return sumMaybe(s1Value, s2[metric.key]?.[index] ?? null);
    });
  }
  return readings;
}

// Legend from the source file (cols J/K, rows 73-77 of the day sheet) — kept
// verbatim so the exported "Loại sự kiện" column matches the original codes.
export const EVENT_TYPES: { code: number; label: string }[] = [
  { code: 1, label: "Bình thường: tăng giảm công suất theo lệnh điều độ" },
  { code: 2, label: "Đốt lò, khởi động, hòa lưới, ngừng tổ máy theo lệnh điều độ" },
  { code: 3, label: "Tách sửa chữa, đưa vào dự phòng sau sửa chữa tổ máy" },
  { code: 4, label: "Bất thường: các cảnh báo quá tải, điện áp cao hoặc thấp, nhiệt độ cao ... " },
  { code: 5, label: "Sự cố: ngừng sự cố tổ máy do bảo vệ tác động" },
];

export type OperatingEvent = {
  id?: number;
  startAt: string; // "YYYY-MM-DD HH:mm"
  endAt: string; // "YYYY-MM-DD HH:mm" or ""
  eventType: number; // 1..5
  description: string;
};

export function nextOperatingDate(operatingDate: string) {
  const [year, month, day] = operatingDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function validateOperatingEventDateRange(
  operatingDate: string,
  startAt: string,
  endAt: string,
): "start-date" | "end-date" | "end-before-start" | null {
  if (!startAt.startsWith(`${operatingDate} `)) return "start-date";
  if (!endAt) return null;
  const endDate = endAt.slice(0, 10);
  if (endDate !== operatingDate && endDate !== nextOperatingDate(operatingDate)) return "end-date";
  if (endAt < startAt) return "end-before-start";
  return null;
}

export type UnitTotals = { dauCuc: number | null; thuongPham: number | null; gridReceivedMwh?: number | null; thanTieuThu: number | null; thanTonKho: number | null };

export type BcsxExportInput = {
  operatingDate: string; // YYYY-MM-DD
  unit: ExportUnit;
  readings: Partial<Record<ShiftMetric, (number | null)[]>>; // 48 values per metric, in SHIFT_TIME_SLOTS order
  totals: UnitTotals; // đầu cực/thương phẩm/điện nhận lưới/than tiêu thụ/than tồn kho — tự dùng computed
  events: OperatingEvent[];
};

export function datePartsVN(operatingDate: string) {
  const [y, m, d] = operatingDate.split("-");
  return `${d}/${m}/${y}`;
}

export async function buildBcsxWorkbook(input: BcsxExportInput): Promise<ArrayBuffer> {
  const { BCSX_TEMPLATE_S1_BASE64, BCSX_TEMPLATE_S2_BASE64, BCSX_TEMPLATE_A0_BASE64 } = await import("./bcsx-templates.generated");
  const base64 = input.unit === "S1" ? BCSX_TEMPLATE_S1_BASE64 : input.unit === "S2" ? BCSX_TEMPLATE_S2_BASE64 : BCSX_TEMPLATE_A0_BASE64;
  return buildBcsxWorkbookFromTemplate(input, base64);
}

export async function buildBcsxWorkbookFromTemplate(input: BcsxExportInput, base64: string): Promise<ArrayBuffer> {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = (ExcelJSModule.default ?? ExcelJSModule) as typeof ExcelJSModule.default;
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer);
  const ws = workbook.getWorksheet("BCSX");
  if (!ws) throw new Error("Không tìm thấy sheet mẫu BCSX trong file template.");

  for (const metric of SHIFT_METRICS) {
    const values = input.readings[metric.key];
    if (!values) continue;
    for (let i = 0; i < SHIFT_TIME_SLOTS.length; i++) {
      const value = values[i];
      if (value === null || value === undefined || Number.isNaN(value)) continue;
      ws.getCell(`${metric.col}${11 + i}`).value = value;
    }
  }

  const tuDung = calculateAuxiliaryElectricity(
    input.totals.dauCuc,
    input.totals.thuongPham,
    input.totals.gridReceivedMwh,
  ).totalMwh;
  const totalCells: [string, number | null][] = [
    ["C60", input.totals.dauCuc],
    ["C61", input.totals.thuongPham],
    ["C62", tuDung],
    ["C63", input.totals.thanTieuThu],
    ["C64", input.totals.thanTonKho],
  ];
  for (const [coord, value] of totalCells) if (value !== null) ws.getCell(coord).value = value;

  // Events are written in the order the caller already put them in — for S1/S2
  // that's chronological (DB query orders by start_at); for A0 the caller
  // concatenates S1's rows followed by S2's rows (not time-interleaved), per
  // the user's explicit instruction, so do NOT re-sort here.
  input.events.forEach((event, i) => {
    const row = 72 + i;
    ws.getCell(`A${row}`).value = formatEventTimestamp(event.startAt);
    ws.getCell(`B${row}`).value = event.endAt ? formatEventTimestamp(event.endAt) : "";
    ws.getCell(`C${row}`).value = event.eventType;
    ws.getCell(`D${row}`).value = event.description;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

function formatEventTimestamp(value: string) {
  // value is "YYYY-MM-DD HH:mm" — the source file uses "MM/DD/YYYY HH:mm".
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  return `${mo}/${d}/${y} ${h}:${mi}`;
}

export function fileNameFor(unit: ExportUnit, operatingDate: string) {
  const [y, m, d] = operatingDate.split("-");
  return `BCSX_NMD_${unit}_${d}.${m}.${y}.xlsx`;
}
