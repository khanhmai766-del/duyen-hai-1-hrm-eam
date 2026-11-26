/** "Copy báo cáo ngày" MNK: tin nhắn báo cáo độ rung 14 máy nén khí (chuyển từ mnk-shift.js; phần AI chưa có, dùng nhận định tự so với ngày trước). */
import { VIB_LABELS } from "@/lib/vibration/constants";
import { addDays, cellNumber } from "@/lib/vibration/parse";
import type { VibrationDeviceDto, VibrationRecordDto } from "@/lib/vibration/types";
import { displayDate } from "./export-core";

export interface MnkDayRow {
  name: string;
  vals: [string, number][];
  note: string;
}
export interface MnkDay {
  day: string;
  rows: MnkDayRow[];
}

const shortName = (n: string) => n.replace("Động cơ MNK điều khiển và dịch vụ số ", "MNK số ").replace("Động cơ MNK vận chuyển tro bay ", "MNK tro bay ");

/** Số rung (vận tốc / biên độ) đã lưu của các máy trong ngày `date` và 7 ngày trước (ngày không có số bị bỏ). */
export function mnkDayData(devices: VibrationDeviceDto[], records: VibrationRecordDto[], date: string): MnkDay[] {
  const byDay = new Map<string, Map<string, VibrationRecordDto>>();
  for (const r of records) {
    if (!r.date) continue;
    if (!byDay.has(r.date)) byDay.set(r.date, new Map());
    byDay.get(r.date)!.set(r.deviceId, r);
  }
  const days: MnkDay[] = [];
  for (let k = 0; k <= 7; k++) {
    const day = addDays(date, -k);
    const rows: MnkDayRow[] = [];
    for (const d of devices) {
      const r = byDay.get(day)?.get(d.id);
      if (!r) continue;
      const vals: [string, number][] = [];
      VIB_LABELS.forEach((l, i) => {
        const n = cellNumber(r.values?.[i]);
        if (n !== null && /Vận tốc|Biên độ/.test(l)) vals.push([l, n]);
      });
      const note = String(r.note || "").trim();
      if (vals.length || note) rows.push({ name: shortName(d.name), vals, note });
    }
    if (rows.length) days.push({ day, rows });
  }
  return days;
}

export const mnkHead = (date: string) =>
  `Gửi các anh thông số độ rung trục vít và độ rung phía dẫn động của động cơ, các máy nén khí ngày ${displayDate(date)}.`;

const vmax = (row: MnkDayRow) => Math.max(...row.vals.filter(([l]) => /Vận tốc/.test(l)).map(([, n]) => n), -Infinity);

/** Nhận định tự động: máy nào tăng vận tốc lớn nhất so với ngày có số liền trước. */
export function mnkFallback(days: MnkDay[]): string {
  const [cur, prev] = days;
  if (!prev) return "Chưa có số liệu ngày trước để so sánh.";
  const up: string[] = [];
  for (const r of cur.rows) {
    const p = prev.rows.find((x) => x.name === r.name);
    const a = vmax(r);
    const b = p ? vmax(p) : -Infinity;
    if (a > -Infinity && b > -Infinity && a - b > 0.5 && a > b * 1.2) up.push(`${r.name} (${b} → ${a} mm/s)`);
  }
  return up.length
    ? `Độ rung tăng so với ngày ${displayDate(prev.day)} ở ${up.join(", ")}, các máy còn lại không dao động nhiều.`
    : "Độ rung so với ngày trước không dao động nhiều.";
}

export const mnkReportText = (date: string, days: MnkDay[]) => `${mnkHead(date)} ${mnkFallback(days)}`;
