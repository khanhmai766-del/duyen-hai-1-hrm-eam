import { SHIFT_METRICS, SHIFT_TIME_SLOTS, type ShiftMetric, type Unit } from "./bcsx";
import { SHIFT_TIMES } from "./water-report/schema";

export type MissingDataItem = { key: string; label: string; group?: string };

export function isMissingValue(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}

type CtktktWarningField = {
  cell: string;
  label: string;
  section: string;
  sectionLabel: string;
  row: number;
};

const PMIS_WEB_COLUMNS: Record<string, string> = {
  C: "Công suất đặt", D: "Điện năng tác dụng", E: "Điện năng phản kháng",
  F: "Điện năng giao", G: "Điện năng nhận", H: "Điện năng nhận chạy bù",
  I: "MBA kích từ", J: "MBA nâng", K: "Điện năng tự dùng", L: "Hệ số tự dùng",
  M: "Nhiên liệu sử dụng", N: "Suất hao nhiên liệu thô", O: "Suất hao nhiên liệu tinh",
  P: "Suất hao nhiệt thô", Q: "Suất hao nhiệt tinh", R: "Hệ số sử dụng",
  S: "Hệ số đáp ứng", T: "Độ phát thải",
};

/** Mô tả theo đúng vị trí người dùng nhìn thấy trên web; địa chỉ Excel luôn đặt cuối. */
export function describeCtktktMissingField(field: CtktktWarningField): string | null {
  // Dòng 183-184 là vùng phụ trợ của mẫu Excel, không phải ô nhập trên bảng web.
  if (field.section === "pmis_02pd" && (field.row === 183 || field.row === 184)) return null;

  if (field.section === "pmis_02pd" && field.row === 181) {
    const columnLetter = field.cell.match(/^[A-Z]+/)?.[0] || "";
    return `Hàng: Duyên Hải 1 · Cột: ${PMIS_WEB_COLUMNS[columnLetter] || field.label} · Nội dung: ${field.sectionLabel} · Ô file chỉ tiêu: ${field.cell}`;
  }

  const parts = field.label.split(" · ").map(part => part.trim()).filter(Boolean);
  const rowLabel = parts[0] || field.label || `Hàng ${field.row}`;
  const columnLabel = parts.slice(1).join(" · ") || "Giá trị";
  return `Hàng: ${rowLabel} · Cột: ${columnLabel} · Nội dung: ${field.sectionLabel} · Ô file chỉ tiêu: ${field.cell}`;
}

export function elapsedDaysInPeriod(period: string, throughDate: string) {
  if (period < throughDate.slice(0, 7)) return new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate();
  if (period > throughDate.slice(0, 7)) return 0;
  return Number(throughDate.slice(8, 10));
}

export function listMonthlyMissing(
  rows: Array<Record<string, string>>,
  period: string,
  throughDate: string,
  requiredFields: Array<{ code: string; label: string }>,
): MissingDataItem[] {
  const throughDay = elapsedDaysInPeriod(period, throughDate);
  const items: MissingDataItem[] = [];
  for (let day = 1; day <= throughDay; day += 1) {
    for (const field of requiredFields) {
      if (isMissingValue(rows[day - 1]?.[field.code])) {
        items.push({ key: `${day}:${field.code}`, label: `Ngày ${String(day).padStart(2, "0")} · ${field.label} [${field.code}]`, group: `Ngày ${String(day).padStart(2, "0")}` });
      }
    }
  }
  return items;
}

export function listBcsxMissing(grids: Record<Unit, Record<ShiftMetric, string[]>>) {
  const items: MissingDataItem[] = [];
  for (const unit of ["S1", "S2"] as const) {
    for (const metric of SHIFT_METRICS) {
      SHIFT_TIME_SLOTS.forEach((slot, index) => {
        if (isMissingValue(grids[unit][metric.key]?.[index])) {
          items.push({ key: `${unit}:${metric.key}:${slot}`, label: `${slot} · ${metric.label}`, group: unit });
        }
      });
    }
  }
  return items;
}

export function listMissingWaterShifts(shifts: Array<{ logDate: string; shiftTime: string }>, month: string, throughDate: string) {
  const expected = new Set(shifts.map(shift => `${shift.logDate}|${shift.shiftTime}`));
  const items: MissingDataItem[] = [];
  const throughDay = elapsedDaysInPeriod(month, throughDate);
  for (let day = 1; day <= throughDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    for (const shiftTime of SHIFT_TIMES) {
      if (!expected.has(`${date}|${shiftTime}`)) {
        items.push({ key: `${date}:${shiftTime}`, label: `${date.split("-").reverse().join("/")} · ca ${shiftTime}`, group: "Ca chưa nhập" });
      }
    }
  }
  return items;
}
