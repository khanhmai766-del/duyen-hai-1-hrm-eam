import type { Prisma } from "@prisma/client";
import { recalculateWaterShiftChain, type WaterShiftLog } from "./calculations";
import { readStoredWaterAdjustments, type InvalidWaterAdjustment } from "./adjustments";

/**
 * Đọc/ghi sổ theo dõi lượng nước bằng Prisma (giai đoạn 3) — dùng chung cho route chính, route nạp file và file xuất Excel.
 * Thứ tự ca trong ngày giữ đúng `CASE shift_time …` của SQL cũ (Prisma không sắp theo biểu thức → sắp trong JS).
 */
type Db = Prisma.TransactionClient;
type Row = Record<string, unknown>;

export const WATER_SHIFT_TIMES = ["06h00", "14h00", "22h00"] as const;
/** Trong tháng: 06h00 → 14h00 → 22h00, giờ lạ xếp cuối (ELSE 9). */
const monthRank = (shiftTime: string) => ({ "06h00": 1, "14h00": 2, "22h00": 3 } as Record<string, number>)[shiftTime] ?? 9;
/** Ca mốc: ca muộn nhất của ngày trước tháng, giờ lạ thấp nhất (ELSE 0). */
const baselineRank = (shiftTime: string) => ({ "22h00": 3, "14h00": 2, "06h00": 1 } as Record<string, number>)[shiftTime] ?? 0;

/** Hiệu chỉnh hỏng của một ca (kèm ngày + giờ ca) — trả cho trang để cảnh báo. */
export type InvalidShiftAdjustment = InvalidWaterAdjustment & { logDate: string; shiftTime: string };

export function waterRowToLog(row: Row, options: { updatedAt?: boolean; onInvalid?: (items: InvalidShiftAdjustment[]) => void } = {}): WaterShiftLog {
  const adjustments = readStoredWaterAdjustments(row);
  if (adjustments.invalid.length) options.onInvalid?.(adjustments.invalid.map(item => ({ ...item, logDate: String(row.log_date || ""), shiftTime: String(row.shift_time || "") })));
  const log: WaterShiftLog = {
    ...adjustments.values,
    id: Number(row.id || 0),
    logDate: String(row.log_date || ""),
    shiftTime: String(row.shift_time || ""),
    shiftTeam: String(row.shift_team || ""),
    shiftLeader: String(row.shift_leader || ""),
    elecRecS1: Number(row.elec_rec_s1 ?? 0),
    elecRecS2: Number(row.elec_rec_s2 ?? 0),
    elecGenS1: Number(row.elec_gen_s1 ?? 0),
    elecGenS2: Number(row.elec_gen_s2 ?? 0),
    waterRecS1: Number(row.water_rec_s1 ?? 0),
    waterRecS2: Number(row.water_rec_s2 ?? 0),
    waterUsedS1: Number(row.water_used_s1 ?? 0),
    waterUsedS2: Number(row.water_used_s2 ?? 0),
    waterRatioS1: Number(row.water_ratio_s1 ?? 0),
    waterRatioS2: Number(row.water_ratio_s2 ?? 0),
    condenserRecS1: Number(row.condenser_rec_s1 ?? 0),
    condenserRecS2: Number(row.condenser_rec_s2 ?? 0),
    condenserUsedS1: Number(row.condenser_used_s1 ?? 0),
    condenserUsedS2: Number(row.condenser_used_s2 ?? 0),
    resinWaterS1_24h: Number(row.resin_water_s1_24h ?? 0),
    resinWaterS2_24h: Number(row.resin_water_s2_24h ?? 0),
    note: String(row.note || ""),
  };
  if (options.updatedAt) log.updatedAt = String(row.updated_at || "");
  return log;
}

export function nextWaterMonth(month: string) {
  const year = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

/** Sắp các dòng đã theo ngày tăng dần: trong từng ngày theo thứ tự ca (sắp ổn định, giữ thứ tự id khi trùng hạng). */
function sortWithinDays<T extends { log_date: string; shift_time: string }>(rows: T[], rank: (shift: string) => number, direction: 1 | -1) {
  const out: T[] = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[j].log_date === rows[i].log_date) j++;
    out.push(...rows.slice(i, j).sort((a, b) => direction * (rank(a.shift_time) - rank(b.shift_time))));
    i = j;
  }
  return out;
}

/** Ca mốc liền trước tháng (= SELECT * … WHERE log_date < ? ORDER BY log_date DESC, CASE … DESC LIMIT 1). */
export async function loadWaterBaseline(db: Db, month: string) {
  const latest = await db.ctktktWaterShiftLogs.findFirst({ where: { log_date: { lt: `${month}-01` } }, orderBy: { log_date: "desc" }, select: { log_date: true } });
  if (!latest) return null;
  const sameDay = await db.ctktktWaterShiftLogs.findMany({ where: { log_date: latest.log_date }, orderBy: { id: "asc" } });
  return sortWithinDays(sameDay, baselineRank, -1)[0] ?? null;
}

/** Mọi ca trong tháng (= … WHERE log_date >= ? AND log_date < ? ORDER BY log_date ASC, CASE … ASC). */
export async function loadWaterMonthRows(db: Db, month: string) {
  const rows = await db.ctktktWaterShiftLogs.findMany({
    where: { log_date: { gte: `${month}-01`, lt: `${nextWaterMonth(month)}-01` } },
    orderBy: [{ log_date: "asc" }, { id: "asc" }],
  });
  return sortWithinDays(rows, monthRank, 1);
}

/** Toàn bộ sổ theo thứ tự ngày + ca (API đối chiếu). */
export async function loadAllWaterRows(db: Db) {
  const rows = await db.ctktktWaterShiftLogs.findMany({ orderBy: [{ log_date: "asc" }, { id: "asc" }] });
  return sortWithinDays(rows, monthRank, 1);
}

/** Ca mốc + các ca trong tháng đã tính chuỗi (số dùng/suất) — như GET và file xuất. */
export async function loadWaterChain(db: Db, month: string, options: { updatedAt?: boolean } = {}) {
  const [baselineRow, monthRows] = [await loadWaterBaseline(db, month), await loadWaterMonthRows(db, month)];
  // Hiệu chỉnh hỏng (chỉ có thể lọt qua đường ngoài form, vd sửa tay DB) → tính như chưa hiệu chỉnh và báo lại.
  const invalidAdjustments: InvalidShiftAdjustment[] = [];
  const read = { ...options, onInvalid: (items: InvalidShiftAdjustment[]) => { invalidAdjustments.push(...items); } };
  // Ca mốc (tháng trước) chỉ cho chỉ số đầu kỳ — hiệu chỉnh của nó không vào phép tính tháng này, nên không báo ở đây.
  const baseline = baselineRow ? waterRowToLog(baselineRow, options) : null;
  const monthShifts = monthRows.map(row => waterRowToLog(row, read));
  const chained = recalculateWaterShiftChain(baseline ? [baseline, ...monthShifts] : monthShifts);
  // chained = ca mốc (giữ nguyên) + ca trong tháng đã tính; monthShifts = ca trong tháng chưa tính (sheet hiệu chỉnh).
  return { baseline, monthShifts, chained, shifts: baseline ? chained.slice(1) : chained, invalidAdjustments };
}

/** Tính lại và ghi các cột suy ra (điện phát, nước dùng, suất…) cho từng tháng bị ảnh hưởng, trong giao dịch `tx`. */
export async function recalculateWaterMonths(tx: Db, months: Iterable<string>) {
  for (const month of months) {
    const { shifts } = await loadWaterChain(tx, month);
    for (const item of shifts) {
      await tx.ctktktWaterShiftLogs.updateMany({
        where: { log_date: item.logDate, shift_time: item.shiftTime },
        data: {
          elec_gen_s1: item.elecGenS1, elec_gen_s2: item.elecGenS2,
          water_used_s1: item.waterUsedS1, water_used_s2: item.waterUsedS2,
          water_ratio_s1: item.waterRatioS1, water_ratio_s2: item.waterRatioS2,
          condenser_used_s1: item.condenserUsedS1, condenser_used_s2: item.condenserUsedS2,
        },
      });
    }
  }
}
