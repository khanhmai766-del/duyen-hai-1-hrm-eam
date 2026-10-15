// Tiến độ THỰC TẾ so với đường găng kế hoạch SCL S2 (15/10/2026) — phần thuần, dùng chung server/client (không import prisma).
import { isMilestoneDate, type OverhaulMilestone } from "./overhaul-milestones";
import { OVERHAUL_DAY_COUNT, overhaulDayDate } from "./overhaul-milestones-source";

/** Một lần cập nhật thực tế (bảng OverhaulMilestoneProgress) — dựng đường S thực tế theo ngày. */
export type MilestoneProgressLog = {
  id: string;
  milestoneId: string;
  reportDate: string;
  actualStart: string | null;
  actualEnd: string | null;
  percent: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};
export type ActualInput = { actualStart: string | null; actualEnd: string | null; percent: number; note: string | null; reportDate: string };
/**
 * Được ghi thực tế: Quản trị, Quản lý, Kỹ thuật viên (vai trò HIỆU LỰC của requireUser — ADMIN chưa bật chế độ quản trị
 * tính là MANAGER, tài khoản tra cứu là VIEWER). Sửa KẾ HOẠCH vẫn chỉ ADMIN (app/api/overhaul-milestones/route.ts).
 */
export const ACTUAL_WRITERS = ["ADMIN", "MANAGER", "TECHNICIAN"] as const;
type Plan = Pick<OverhaulMilestone, "startDate" | "endDate">;
type Actual = { actualEnd?: string | null; actualPercent?: number | null };

const DAY = 86_400_000;
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((stamp(to) - stamp(from)) / DAY);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const isRangeMilestone = (item: Plan) => Boolean(item.endDate && item.endDate !== item.startDate);
const planEnd = (item: Plan) => item.endDate ?? item.startDate;

/** Trọng số theo số ngày kế hoạch: mốc đơn = 1, khoảng ngày = số ngày tính cả hai đầu. */
export function milestoneWeight(item: Plan) {
  return isRangeMilestone(item) ? daysBetween(item.startDate, planEnd(item)) + 1 : 1;
}

/** Phần kế hoạch phải xong tới hết ngày `day`: mốc đơn 0/1, khoảng ngày tăng đều theo ngày. */
export function plannedFraction(item: Plan, day: string) {
  if (!isRangeMilestone(item)) return day >= item.startDate ? 1 : 0;
  return clamp01((daysBetween(item.startDate, day) + 1) / milestoneWeight(item));
}

/** Phần thực tế đã xong: có ngày hoàn thành = 1; chưa xong lấy % (mốc đơn chỉ 0/1). */
export function actualFraction(item: Plan & Actual) {
  if (item.actualEnd) return 1;
  const percent = item.actualPercent ?? 0;
  return isRangeMilestone(item) ? clamp01(percent / 100) : percent >= 100 ? 1 : 0;
}

export type MilestoneTone = "good" | "warn" | "bad" | "idle";
export type MilestoneStatus = { tone: MilestoneTone; label: string; planned: number; actual: number };

/** Trạng thái một mốc so với kế hoạch tại `today` (ngày Việt Nam yyyy-mm-dd). */
export function milestoneStatus(item: Plan & Actual & { actualStart?: string | null }, today: string): MilestoneStatus {
  const planned = plannedFraction(item, today), actual = actualFraction(item);
  const end = planEnd(item);
  if (item.actualEnd) {
    const late = daysBetween(end, item.actualEnd);
    return { planned, actual, tone: late > 0 ? "warn" : "good",
      label: late > 0 ? `Hoàn thành trễ ${late} ngày` : late < 0 ? `Hoàn thành sớm ${-late} ngày` : "Hoàn thành đúng hạn" };
  }
  if (today > end) return { planned, actual, tone: "bad", label: `Quá hạn ${daysBetween(end, today)} ngày${actual > 0 ? ` · đã làm ${Math.round(actual * 100)}%` : ""}` };
  if (today < item.startDate) return { planned, actual, tone: "idle", label: "Chưa tới hạn" };
  const started = Boolean(item.actualStart) || actual > 0;
  if (!started) {
    const late = daysBetween(item.startDate, today);
    return late > 0 ? { planned, actual, tone: "warn", label: `Trễ bắt đầu ${late} ngày` } : { planned, actual, tone: "idle", label: "Đến ngày kế hoạch" };
  }
  const gap = Math.round((actual - planned) * 100), done = Math.round(actual * 100);
  if (gap < -5) return { planned, actual, tone: "warn", label: `Đang làm ${done}% · chậm ${-gap}%` };
  return { planned, actual, tone: "good", label: gap > 5 ? `Đang làm ${done}% · vượt ${gap}%` : `Đang làm ${done}% · đúng kế hoạch` };
}

export type CampaignProgress = {
  /** % kế hoạch / thực tế toàn đợt (0–100, 1 chữ số lẻ), trọng số theo số ngày kế hoạch. */
  planned: number; actual: number; deviation: number;
  /** actual / planned; null khi kế hoạch còn 0%. */
  spi: number | null;
  /** Mốc chậm (vàng) / quá hạn (đỏ). */
  behind: number; overdue: number;
};
const round1 = (value: number) => Math.round(value * 1000) / 10;

/** % toàn đợt tại `today`. */
export function campaignProgress(items: Array<Plan & Actual & { actualStart?: string | null }>, today: string): CampaignProgress {
  let weight = 0, planned = 0, actual = 0, behind = 0, overdue = 0;
  for (const item of items) {
    const w = milestoneWeight(item), status = milestoneStatus(item, today);
    weight += w; planned += w * status.planned; actual += w * status.actual;
    if (status.tone === "bad") overdue++;
    else if (status.tone === "warn" && !item.actualEnd) behind++;
  }
  const p = weight ? planned / weight : 0, a = weight ? actual / weight : 0;
  return { planned: round1(p), actual: round1(a), deviation: round1(a - p), spi: p > 0 ? Math.round((a / p) * 100) / 100 : null, behind, overdue };
}

export type SCurvePoint = { day: number; date: string; planned: number; actual: number | null };

/**
 * Đường S cộng dồn ngày 1…60. Kế hoạch tính mọi ngày; thực tế tới `today`: mỗi mốc lấy lần cập nhật gần nhất có ngày
 * ghi nhận ≤ ngày đó, và coi là xong từ ngày hoàn thành thực tế (nhập bù sau vẫn tính đúng ngày xong).
 */
export function progressSCurve(items: Array<OverhaulMilestone>, logs: MilestoneProgressLog[], today: string): SCurvePoint[] {
  const byMilestone = new Map<string, MilestoneProgressLog[]>();
  for (const log of [...logs].sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.createdAt.localeCompare(b.createdAt))) {
    byMilestone.set(log.milestoneId, [...(byMilestone.get(log.milestoneId) ?? []), log]);
  }
  const total = items.reduce((sum, item) => sum + milestoneWeight(item), 0) || 1;
  return Array.from({ length: OVERHAUL_DAY_COUNT }, (_, index) => {
    const date = overhaulDayDate(index + 1);
    let planned = 0, actual = 0;
    for (const item of items) {
      const w = milestoneWeight(item);
      planned += w * plannedFraction(item, date);
      if (date > today) continue;
      const doneBy = item.actualEnd && item.actualEnd <= date;
      const known = (byMilestone.get(item.id) ?? []).filter(log => log.reportDate <= date).at(-1);
      const fraction = doneBy ? 1 : known ? actualFraction({ ...item, actualEnd: known.actualEnd && known.actualEnd <= date ? known.actualEnd : null, actualPercent: known.percent }) : 0;
      actual += w * fraction;
    }
    return { day: index + 1, date, planned: round1(planned / total), actual: date > today ? null : round1(actual / total) };
  });
}

/** Kiểm tra dữ liệu nhập thực tế; ném Error với câu báo tiếng Việt. */
export function parseActualInput(value: unknown, item: Plan, today: string): ActualInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Dữ liệu thực tế không hợp lệ");
  const body = value as Record<string, unknown>;
  const date = (key: string, label: string) => {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") return null;
    if (!isMilestoneDate(raw)) throw new Error(`${label} không hợp lệ`);
    if (raw > today) throw new Error(`${label} không được sau hôm nay`);
    return raw;
  };
  const actualStart = date("actualStart", "Ngày bắt đầu thực tế");
  const actualEnd = date("actualEnd", "Ngày hoàn thành thực tế");
  const reportDate = date("reportDate", "Ngày ghi nhận") ?? today;
  if (actualStart && actualEnd && actualEnd < actualStart) throw new Error("Ngày hoàn thành phải từ ngày bắt đầu trở đi");
  const rawPercent = typeof body.percent === "number" ? body.percent : Number(body.percent ?? 0);
  if (!Number.isFinite(rawPercent) || rawPercent < 0 || rawPercent > 100) throw new Error("% đã làm phải từ 0 đến 100");
  let percent = Math.round(rawPercent);
  if (actualEnd) percent = 100;
  else if (!isRangeMilestone(item) && percent !== 0 && percent !== 100) throw new Error("Mốc đơn chỉ ghi chưa xong hoặc đã hoàn thành");
  else if (percent === 100) throw new Error("Đã làm 100% thì nhập ngày hoàn thành thực tế");
  if (body.note != null && typeof body.note !== "string") throw new Error("Ghi chú không hợp lệ");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 1000) throw new Error("Ghi chú tối đa 1.000 ký tự");
  return { actualStart: actualStart ?? (actualEnd && !isRangeMilestone(item) ? actualEnd : null), actualEnd, percent, note: note || null, reportDate };
}
