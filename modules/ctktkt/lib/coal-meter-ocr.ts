// Node's built-in TypeScript test runner requires the explicit extension here.
import type { CtktktDayEntries } from "./ctktkt-report";

export const COAL_METER_CODES = ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2", "F1", "F2"] as const;
export type CoalMeterCode = (typeof COAL_METER_CODES)[number];
export type CoalUnit = "S1" | "S2";
export type CoalSlot = "08" | "16" | "24";
export type CoalMeterKey = `${CoalUnit}-${CoalMeterCode}`;

export const COAL_SLOTS: CoalSlot[] = ["08", "16", "24"];
/** A feeder cannot plausibly deliver more than this between two readings (8 h). */
export const MAX_COAL_METER_DELTA = 1500;

const SLOT_COLUMNS: Record<CoalUnit, Record<CoalSlot, string>> = {
  S1: { "08": "X", "16": "Z", "24": "AB" },
  S2: { "08": "AH", "16": "AJ", "24": "AL" },
};

export const ALL_COAL_METER_KEYS: CoalMeterKey[] = (["S1", "S2"] as const).flatMap(unit => COAL_METER_CODES.map(code => `${unit}-${code}` as CoalMeterKey));

/** Report order: S1/S2, A1–F2, then 08/16/24h. Unidentified photos go last. */
export function compareCoalMeterOrder(
  a: {key: CoalMeterKey | "" | null; slot: string},
  b: {key: CoalMeterKey | "" | null; slot: string},
) {
  const meterRank = (key: typeof a.key) => key ? ALL_COAL_METER_KEYS.indexOf(key) : ALL_COAL_METER_KEYS.length;
  const slotRank = (slot: string) => {const index=COAL_SLOTS.indexOf(slot as CoalSlot);return index<0?COAL_SLOTS.length:index;};
  return meterRank(a.key) - meterRank(b.key) || slotRank(a.slot) - slotRank(b.slot);
}

export function coalMeterCell(key: CoalMeterKey, slot: CoalSlot): string {
  const [unit, code] = key.split("-") as [CoalUnit, CoalMeterCode];
  return `${SLOT_COLUMNS[unit][slot]}${16 + COAL_METER_CODES.indexOf(code)}`;
}

export function coalMeterLabel(key: CoalMeterKey) {
  const [unit, code] = key.split("-");
  return `${unit} · ${code}`;
}

export function coalPhotoUnitIssue(unit:CoalUnit,key:CoalMeterKey|""|null,label:CoalMeterKey|null) {
  // Check the observed label too: changing only the destination must not turn
  // a photo of 2D1 into a valid S1 reading.
  const foreign=[label,key].find(value=>value&&!value.startsWith(unit+"-"));
  if(!foreign)return null;
  const [actual,code]=foreign.split("-");
  return `Máy cấp ${actual.slice(1)}${code} thuộc ${actual}, khác tổ ${unit} đang chọn. Bỏ ảnh khỏi lượt này hoặc chọn đúng tổ máy.`;
}

export function coalEntriesMatchUnit(entries:Array<{cell:string}>,unit:CoalUnit){
  const cells=new Set(ALL_COAL_METER_KEYS.filter(key=>key.startsWith(unit+"-")).flatMap(key=>COAL_SLOTS.map(slot=>coalMeterCell(key,slot))));
  return entries.length>0&&entries.every(entry=>cells.has(entry.cell));
}

function numberOf(entries: CtktktDayEntries | undefined, cell: string) {
  const raw = entries?.[cell]?.trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The last reading before the slot: 08h ← 24h of D-1, 16h ← 08h, 24h ← 16h (falling back to earlier readings). */
export function previousCoalReading(key: CoalMeterKey, slot: CoalSlot, current: CtktktDayEntries, previous?: CtktktDayEntries): number | null {
  const today = (s: CoalSlot) => numberOf(current, coalMeterCell(key, s));
  const yesterday = (s: CoalSlot) => numberOf(previous, coalMeterCell(key, s));
  const chain = slot === "08"
    ? [yesterday("24"), yesterday("16"), yesterday("08")]
    : slot === "16"
      ? [today("08"), yesterday("24")]
      : [today("16"), today("08"), yesterday("24")];
  return chain.find(value => value !== null) ?? null;
}

/** "1E2" written on the feeder = unit S1, meter E2. Tolerates common OCR confusions and spaces. */
export function parseMeterLabel(text: string): CoalMeterKey | null {
  const cleaned = text.replace(/[|Il!]/g, "1").toUpperCase().replace(/Z/g, "2");
  const match = cleaned.match(/(?:^|[^0-9A-Z])([12])\s?([A-F])\s?([12])(?![0-9])/);
  return match ? `S${match[1]}-${match[2]}${match[3]}` as CoalMeterKey : null;
}

/** Cumulative total shown after "Total:" (e.g. "Total: 75859.247 MTons"). */
export function parseTotalValue(text: string): number | null {
  const normalized = text.replace(/[Oo]/g, "0").replace(/,/g, ".");
  const afterTotal = normalized.match(/T[o0]ta[l1I|]\s*[:;.]?\s*(\d{3,6}(?:\.\d{1,3})?)/i);
  const candidate = afterTotal?.[1] ?? normalized.match(/\b(\d{4,6}\.\d{2,3})\b/)?.[1];
  if (!candidate) return null;
  const value = Number(candidate);
  return Number.isFinite(value) ? value : null;
}

/** Digits-only OCR of the display line: keep the longest number with a decimal part. */
export function parseDigitsLine(text: string): number | null {
  const numbers = (text.replace(/,/g, ".").match(/\d{3,6}\.\d{1,3}/g) || []).sort((a, b) => b.length - a.length);
  const value = numbers.length ? Number(numbers[0]) : NaN;
  return Number.isFinite(value) ? value : null;
}

/** Operators record two decimals by truncation (75859.247 → 75859.24), as in the source workbook. */
export function truncateTwoDecimals(value: number) {
  return Math.trunc(value * 100 + 1e-7) / 100;
}

export type PhotoTime = { date: string; hour: number; minute: number };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Timestamp stamped on the photo, e.g. "25 Sep 2026 at 15:58:46" or "25/09/2026 15:58". */
export function parseOverlayTime(text: string): PhotoTime | null {
  const english = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\D{1,6}(\d{1,2}):(\d{2})/);
  if (english && MONTHS[english[2].toLowerCase()]) {
    return { date: isoDate(Number(english[3]), MONTHS[english[2].toLowerCase()], Number(english[1])), hour: Number(english[4]), minute: Number(english[5]) };
  }
  const numeric = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\D{1,6}(\d{1,2}):(\d{2})/);
  if (numeric) return { date: isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1])), hour: Number(numeric[4]), minute: Number(numeric[5]) };
  return null;
}

/** EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") from a JPEG, when the phone kept it. */
export function readExifTime(buffer: ArrayBuffer): PhotoTime | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const u16 = (at: number) => view.getUint16(at, little);
      const u32 = (at: number) => view.getUint32(at, little);
      const readTag = (ifd: number, tag: number) => {
        const count = u16(ifd);
        for (let i = 0; i < count; i += 1) {
          const entry = ifd + 2 + i * 12;
          if (entry + 12 > view.byteLength) return null;
          if (u16(entry) === tag) return entry;
        }
        return null;
      };
      const ifd0 = tiff + u32(tiff + 4);
      const exifPointer = readTag(ifd0, 0x8769);
      const exifIfd = exifPointer !== null ? tiff + u32(exifPointer + 8) : null;
      const entry = (exifIfd !== null ? readTag(exifIfd, 0x9003) : null) ?? readTag(ifd0, 0x0132);
      if (entry === null) return null;
      const start = tiff + u32(entry + 8);
      let text = "";
      for (let i = 0; i < 19 && start + i < view.byteLength; i += 1) text += String.fromCharCode(view.getUint8(start + i));
      const match = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
      return match ? { date: `${match[1]}-${match[2]}-${match[3]}`, hour: Number(match[4]), minute: Number(match[5]) } : null;
    }
    if ((marker & 0xff00) !== 0xff00 || size < 2) return null;
    offset += 2 + size;
  }
  return null;
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Reading slot for a photo time: around 08h → 08, around 16h → 16, 21h–03h → 24
 * (photos taken just after midnight belong to the 24h reading of the previous day).
 */
export function slotForPhotoTime(time: PhotoTime): { slot: CoalSlot; operatingDate: string } | null {
  const minutes = time.hour * 60 + time.minute;
  if (minutes >= 5 * 60 && minutes < 12 * 60) return { slot: "08", operatingDate: time.date };
  if (minutes >= 13 * 60 && minutes < 20 * 60) return { slot: "16", operatingDate: time.date };
  if (minutes >= 21 * 60) return { slot: "24", operatingDate: time.date };
  if (minutes < 3 * 60) return { slot: "24", operatingDate: shiftDate(time.date, -1) };
  return null;
}

export type MeterMatch = { key: CoalMeterKey | null; previous: number | null; delta: number | null; source: "label" | "history" | null };

/**
 * Picks the meter: a readable label wins when it is consistent with that meter's last reading;
 * otherwise the meter whose last reading is just below the value (meters only count upwards).
 */
export function matchCoalMeter(value: number, label: CoalMeterKey | null, previousOf: (key: CoalMeterKey) => number | null): MeterMatch {
  const plausible = (key: CoalMeterKey) => {
    const previous = previousOf(key);
    if (previous === null) return null;
    const delta = value - previous;
    return delta >= -0.01 && delta <= MAX_COAL_METER_DELTA ? { key, previous, delta } : null;
  };
  if (label) {
    const labelled = plausible(label);
    if (labelled) return { ...labelled, source: "label" };
  }
  const candidates = ALL_COAL_METER_KEYS.map(plausible).filter(candidate => candidate !== null).sort((a, b) => a.delta - b.delta);
  if (candidates.length) return { ...candidates[0], source: "history" };
  if (label) return { key: label, previous: previousOf(label), delta: previousOf(label) === null ? null : value - (previousOf(label) as number), source: "label" };
  return { key: null, previous: null, delta: null, source: null };
}

export type PhotoReviewStatus = { level: "ok" | "check"; reasons: string[] };

export function reviewCoalReading(input: {
  value: number | null;
  match: MeterMatch;
  label: CoalMeterKey | null;
  slot: CoalSlot | null;
  photoDate: string | null;
  reportDate: string;
  duplicate: boolean;
}): PhotoReviewStatus {
  const reasons: string[] = [];
  if (input.value === null) reasons.push("Chưa đọc được chỉ số");
  if (!input.match.key) reasons.push("Chưa xác định được công tơ");
  if (input.label && input.match.key && input.label !== input.match.key) reasons.push(`Nhãn đọc được ${coalMeterLabel(input.label)} khác công tơ gán`);
  if (input.match.delta !== null && input.match.delta < -0.01) reasons.push("Chỉ số nhỏ hơn lần đọc trước");
  if (input.match.delta !== null && input.match.delta > MAX_COAL_METER_DELTA) reasons.push("Tăng bất thường so với lần đọc trước");
  if (input.match.key && input.match.previous === null) reasons.push("Không có số lần trước để đối chiếu");
  if (!input.slot) reasons.push("Chưa xác định mốc giờ");
  if (input.photoDate && input.photoDate !== input.reportDate) reasons.push("Ảnh chụp cho ngày khác ngày báo cáo");
  if (input.duplicate) reasons.push("Trùng công tơ và mốc với ảnh khác");
  return { level: reasons.length ? "check" : "ok", reasons };
}

/** "2026-09-25 15:58" → photo time used to pick the 08h/16h/24h reading. */
export function parseVisionTimestamp(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  return match ? { date: `${match[1]}-${match[2]}-${match[3]}`, hour: Number(match[4]), minute: Number(match[5]) } : null;
}

/** Keeps the digits exactly as displayed; rejects anything that is not a plain decimal number. */
export function parseVisionTotal(value: string | null) {
  const cleaned = value?.trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!cleaned || !/^\d{1,7}(\.\d{1,4})?$/.test(cleaned)) return null;
  return Number(cleaned);
}
