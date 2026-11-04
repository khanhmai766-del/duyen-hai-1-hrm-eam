// Giờ vận hành / sửa chữa / sự cố / dự phòng lũy kế (W68:Z68 cho S1, W69:Z69 cho S2),
// cộng dồn hoàn toàn từ số liệu QLKT đã đồng bộ, bắt đầu từ 01/01/2026.
//   Vận hành: F (giờ phát S1), L (giờ phát S2).
//   Sự cố CT, sửa chữa/bảo dưỡng CU, dự phòng CS: QLKT chỉ có tổng hai tổ máy, nên gán cho tổ máy
//   không chạy đủ 24 giờ; nếu cả hai cùng thiếu giờ thì chia theo số giờ không chạy của từng tổ máy.

export const CTKTKT_OPERATING_HOURS_START_DATE = "2026-01-01";
export const CTKTKT_OPERATING_HOURS_SOURCE_CODES = ["F", "L", "CS", "CT", "CU"] as const;

type Cell = "W68" | "X68" | "Y68" | "Z68" | "W69" | "X69" | "Y69" | "Z69";
export type OperatingHoursTotals = Record<Cell, number>;
export type OperatingHoursResult = {
  byDate: Map<string, OperatingHoursTotals>;
  /** Ngày trong khoảng tính mà QLKT chưa có giờ phát S1 hoặc S2. */
  missingDates: string[];
};

function numeric(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function nextIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function zero(): OperatingHoursTotals {
  return { W68: 0, X68: 0, Y68: 0, Z68: 0, W69: 0, X69: 0, Y69: 0, Z69: 0 };
}

/** Phần tăng của một ngày; null khi QLKT chưa có giờ phát của cả hai tổ máy. */
export function operatingHoursIncrement(day: Record<string, string> | undefined): OperatingHoursTotals | null {
  const s1Run = numeric(day?.F);
  const s2Run = numeric(day?.L);
  if (s1Run === null || s2Run === null) return null;
  const s1Idle = Math.max(0, 24 - s1Run);
  const s2Idle = Math.max(0, 24 - s2Run);
  const idle = s1Idle + s2Idle;
  const split = (code: string) => {
    const total = numeric(day?.[code]) ?? 0;
    if (idle === 0) return [total / 2, total / 2] as const;
    return [total * s1Idle / idle, total * s2Idle / idle] as const;
  };
  const [repair1, repair2] = split("CU");
  const [fault1, fault2] = split("CT");
  const [standby1, standby2] = split("CS");
  return {
    W68: s1Run, X68: repair1, Y68: fault1, Z68: standby1,
    W69: s2Run, X69: repair2, Y69: fault2, Z69: standby2,
  };
}

/**
 * Lũy kế đến hết từng ngày từ CTKTKT_OPERATING_HOURS_START_DATE tới throughDate.
 * `dailyByDate` chứa các mã F, L, CS, CT, CU theo ngày (bảng daily_inputs).
 */
export function calculateOperatingHours(
  dailyByDate: ReadonlyMap<string, Record<string, string>>,
  throughDate: string,
): OperatingHoursResult {
  const byDate = new Map<string, OperatingHoursTotals>();
  const missingDates: string[] = [];
  let running = zero();
  for (let date = CTKTKT_OPERATING_HOURS_START_DATE; date <= throughDate; date = nextIsoDate(date)) {
    const increment = operatingHoursIncrement(dailyByDate.get(date));
    if (increment === null) missingDates.push(date);
    else {
      const next = { ...running };
      for (const cell of Object.keys(next) as Cell[]) next[cell] += increment[cell];
      running = next;
    }
    byDate.set(date, running);
  }
  return { byDate, missingDates };
}

export function formatOperatingHours(value: number) {
  return String(Number(value.toFixed(4)));
}
