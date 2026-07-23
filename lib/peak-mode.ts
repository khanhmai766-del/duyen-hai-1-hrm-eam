export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type CheckInPeakWindow = {
  id: string;
  label: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
};

export const CHECK_IN_PEAK_WINDOWS: CheckInPeakWindow[] = [
  { id: "morning-check-in", label: "Chấm công sáng", start: "05:45", end: "06:15", startMinutes: 5 * 60 + 45, endMinutes: 6 * 60 + 15 },
  { id: "hc-check-in", label: "Chấm công hành chính", start: "07:15", end: "07:45", startMinutes: 7 * 60 + 15, endMinutes: 7 * 60 + 45 },
  { id: "afternoon-check-in", label: "Chấm công chiều/ra ca sáng", start: "13:45", end: "14:15", startMinutes: 13 * 60 + 45, endMinutes: 14 * 60 + 15 },
  { id: "night-handover", label: "Đổi ca đêm", start: "21:45", end: "22:15", startMinutes: 21 * 60 + 45, endMinutes: 22 * 60 + 15 },
];

export const PEAK_BLOCKED_ROUTES = ["/reports", "/devices", "/materials", "/replacements"] as const;

const PEAK_BYPASS_ROLES = new Set(["ADMIN", "MANAGER", "SUPERVISOR", "TECHNICIAN"]);

type PeakModeUser = {
  role?: string | null;
  position?: string | null;
  currentPosition?: string | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
};

function normalizeVietnameseText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function timeToVietnamMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hourText = parts.find((part) => part.type === "hour")?.value ?? "0";
  const minuteText = parts.find((part) => part.type === "minute")?.value ?? "0";
  const hour = Number(hourText) % 24;
  const minute = Number(minuteText);
  return hour * 60 + minute;
}

export function activeCheckInPeakWindow(now: Date = new Date()) {
  const minutes = timeToVietnamMinutes(now);
  return CHECK_IN_PEAK_WINDOWS.find((window) => minutes >= window.startMinutes && minutes < window.endMinutes) ?? null;
}

export function isPeakBlockedHref(href: string) {
  const pathname = href.split("?")[0];
  return PEAK_BLOCKED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isPeakModeBypassUser(user?: PeakModeUser | null) {
  if (!user) return false;
  if (user.role && PEAK_BYPASS_ROLES.has(user.role)) return true;

  const positions = [user.currentPosition, user.position, user.primaryPosition, user.secondaryPosition, user.secondaryPosition2]
    .map((value) => normalizeVietnameseText(value ?? ""))
    .filter(Boolean);

  return positions.some((position) => position.includes("truong kip"));
}
