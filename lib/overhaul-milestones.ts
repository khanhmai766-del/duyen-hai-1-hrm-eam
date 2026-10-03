export const OVERHAUL_CAMPAIGN = "S2-2026";
export const OVERHAUL_TITLE = "Mốc tiến độ SCL S2 — 2026";

export type OverhaulMilestone = {
  id: string;
  sourceKey: string;
  title: string;
  startDate: string;
  endDate: string | null;
  note: string | null;
  sortOrder: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MilestoneInput = Pick<OverhaulMilestone, "title" | "startDate" | "endDate" | "note">;
export type MilestoneEvent = {
  id: string;
  milestoneId: string;
  title: string;
  date: string;
  kind: "POINT" | "START" | "END";
  label: string;
  daysLeft: number;
};
export type MilestoneSchedule = {
  today: string;
  items: OverhaulMilestone[];
  todayEvents: MilestoneEvent[];
  upcoming: MilestoneEvent[];
};

/** Ngày nhà máy, độc lập với múi giờ trình duyệt và server. */
export function vietnamDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function isMilestoneDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseMilestoneInput(value: unknown): MilestoneInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Dữ liệu mốc không hợp lệ");
  const body = value as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 500) throw new Error("Nhập tên mốc, tối đa 500 ký tự");
  if (!isMilestoneDate(body.startDate)) throw new Error("Ngày bắt đầu không hợp lệ");
  const endDate = body.endDate === "" || body.endDate == null ? null : body.endDate;
  if (endDate !== null && !isMilestoneDate(endDate)) throw new Error("Ngày kết thúc không hợp lệ");
  if (endDate && endDate < body.startDate) throw new Error("Ngày kết thúc phải từ ngày bắt đầu trở đi");
  if (body.note != null && typeof body.note !== "string") throw new Error("Ghi chú không hợp lệ");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 2000) throw new Error("Ghi chú tối đa 2.000 ký tự");
  return { title, startDate: body.startDate, endDate, note: note || null };
}

export function milestoneEvents(items: OverhaulMilestone[], today: string): MilestoneEvent[] {
  return items.flatMap((item): MilestoneEvent[] => {
    const ranged = Boolean(item.endDate && item.endDate !== item.startDate);
    const event = (date: string, kind: MilestoneEvent["kind"]): MilestoneEvent => ({
      id: `${item.id}:${kind}:${date}`, milestoneId: item.id, title: item.title, date, kind,
      label: kind === "START" ? "Bắt đầu theo kế hoạch" : kind === "END" ? "Kết thúc theo kế hoạch" : "Mốc theo kế hoạch",
      daysLeft: Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    });
    return ranged ? [event(item.startDate, "START"), event(item.endDate!, "END")] : [event(item.startDate, "POINT")];
  }).sort((a, b) => a.date.localeCompare(b.date) ||
    (items.find((x) => x.id === a.milestoneId)?.sortOrder ?? 0) - (items.find((x) => x.id === b.milestoneId)?.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

export function buildMilestoneSchedule(items: OverhaulMilestone[], now = new Date()): MilestoneSchedule {
  const today = vietnamDate(now);
  const events = milestoneEvents(items, today);
  return {
    today, items,
    todayEvents: events.filter((event) => event.date === today),
    upcoming: events.filter((event) => event.date > today).slice(0, 3),
  };
}

export function milestoneDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function milestonePhase(item: Pick<OverhaulMilestone, "startDate" | "endDate">, today: string) {
  if (item.startDate > today) return "Sắp tới";
  if (item.startDate === today || item.endDate === today) return "Đến ngày kế hoạch";
  if (item.endDate && item.endDate > today) return "Trong khoảng kế hoạch";
  return "Đã qua ngày kế hoạch";
}
