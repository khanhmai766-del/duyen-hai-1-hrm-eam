// Quy tắc dùng chung (client + server) cho mục "Quản lý công việc".
import { normalizeText } from "@/lib/nav";
import { normalizeExternalDocumentUrl } from "@/lib/google-drive-document";

export const WORK_TASK_PERMISSION = "work-task-manage";

/** Người chỉ đạo: danh sách cố định. Lưu khoá, hiển thị nhãn. */
export const WORK_TASK_DIRECTORS = [
  { value: "BGD", label: "BGĐ" },
  { value: "HUAN", label: "Ông Huân (Quản đốc)" },
  { value: "CUONG", label: "Ông Cường (PQĐ)" },
  { value: "YEN", label: "Ông Yên (PQĐ)" },
] as const;

export type WorkTaskDirector = (typeof WORK_TASK_DIRECTORS)[number]["value"];

export function isWorkTaskDirector(value: unknown): value is WorkTaskDirector {
  return WORK_TASK_DIRECTORS.some((item) => item.value === value);
}

export function workTaskDirectorLabel(value?: string | null) {
  return WORK_TASK_DIRECTORS.find((item) => item.value === value)?.label ?? value ?? "";
}

// Chủ trì: mọi tài khoản đang hoạt động, TRỪ Quản đốc / Phó quản đốc (họ là người chỉ đạo).
// Khớp đầu chuỗi đã bỏ dấu: "Quản đốc phân xưởng", "Phó quản đốc", "PQĐ", "QĐ"...
const MANAGER_POSITION = /^(pho\s+quan\s+doc|quan\s+doc|p?qd)\b/;

export function isWorkTaskManagerPosition(position?: string | null) {
  const key = normalizeText(String(position ?? "")).replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(key) && MANAGER_POSITION.test(key);
}

type PositionHolder = {
  position?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
};

const positionsOf = (user: PositionHolder) => [user.position, user.secondaryPosition, user.secondaryPosition2];

/** Đủ điều kiện chủ trì khi không có cương vị chính/phụ nào là Quản đốc / Phó quản đốc. */
export function isWorkTaskLeadUser(user: PositionHolder) {
  return !positionsOf(user).some(isWorkTaskManagerPosition);
}

/** Cương vị dùng để hiển thị: cương vị chính, thiếu thì lấy cương vị phụ đầu tiên. */
export function workTaskLeadPositionOf(user: PositionHolder) {
  return positionsOf(user).find((value) => value?.trim())?.trim() ?? "";
}

// ── Link Google ─────────────────────────────────────────────────────────────
export type WorkTaskLinkKind = "SHEET" | "DOC" | "SLIDE" | "FORM" | "FOLDER" | "DRIVE";
export type WorkTaskLink = { url: string; kind: WorkTaskLinkKind };

export const WORK_TASK_MAX_LINKS = 10;
const MAX_LINK_LENGTH = 1000;

export const WORK_TASK_LINK_LABELS: Record<WorkTaskLinkKind, string> = {
  SHEET: "Sheets",
  DOC: "Docs",
  SLIDE: "Slides",
  FORM: "Forms",
  FOLDER: "Thư mục",
  DRIVE: "Drive",
};

/** Trả link đã chuẩn hoá, hoặc `error` tiếng Việt nếu không phải link Google Drive/Docs/Sheets. */
export function parseGoogleLink(value: string): { link: WorkTaskLink } | { error: string } {
  let raw = String(value ?? "").trim();
  if (!raw) return { error: "Link trống" };
  if (raw.length > MAX_LINK_LENGTH) return { error: "Link quá dài" };
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const normalized = normalizeExternalDocumentUrl(raw);
  if (!normalized) return { error: "Link không hợp lệ" };
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  if (host === "docs.google.com") {
    if (path.startsWith("/spreadsheets")) return { link: { url: normalized, kind: "SHEET" } };
    if (path.startsWith("/document")) return { link: { url: normalized, kind: "DOC" } };
    if (path.startsWith("/presentation")) return { link: { url: normalized, kind: "SLIDE" } };
    if (path.startsWith("/forms")) return { link: { url: normalized, kind: "FORM" } };
    return { link: { url: normalized, kind: "DRIVE" } };
  }
  if (host === "drive.google.com") {
    if (path.includes("/folders/")) return { link: { url: normalized, kind: "FOLDER" } };
    return { link: { url: normalized, kind: "DRIVE" } };
  }
  return { error: "Chỉ nhận link Google Drive, Google Sheets hoặc Google Docs" };
}

/** Kiểm cả danh sách link. Bỏ dòng trống, bỏ link trùng. */
export function parseGoogleLinks(values: unknown): { links: WorkTaskLink[] } | { error: string } {
  if (values == null) return { links: [] };
  if (!Array.isArray(values)) return { error: "Danh sách link không hợp lệ" };
  const links: WorkTaskLink[] = [];
  for (const item of values) {
    const raw = typeof item === "string" ? item : (item as { url?: unknown } | null)?.url;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const parsed = parseGoogleLink(raw);
    if ("error" in parsed) return { error: `${parsed.error}: ${raw.trim().slice(0, 80)}` };
    if (!links.some((link) => link.url === parsed.link.url)) links.push(parsed.link);
  }
  if (links.length > WORK_TASK_MAX_LINKS) return { error: `Tối đa ${WORK_TASK_MAX_LINKS} link cho một công việc` };
  return { links };
}

// ── Ngày ────────────────────────────────────────────────────────────────────
/** "YYYY-MM-DD" → Date UTC 00:00 (cột kiểu DATE). Sai định dạng → null. */
export function parseWorkTaskDate(value: unknown): Date | null {
  const raw = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
}

/** ISO (từ cột DATE) → "DD/MM/YYYY". */
export function formatWorkTaskDate(value?: string | null) {
  const raw = String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** ISO → "YYYY-MM-DD" cho <input type="date">. */
export function workTaskDateInputValue(value?: string | null) {
  const raw = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** Ngày hôm nay theo giờ Việt Nam, dạng "YYYY-MM-DD". */
export function workTaskToday() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** ISO (cột DATE) → "Thứ Hai"... */
export function workTaskWeekday(value?: string | null) {
  const raw = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return WEEKDAYS[new Date(`${raw}T00:00:00.000Z`).getUTCDay()] ?? "";
}

/**
 * Màu cảnh báo hạn hoàn thành:
 * - "yellow": còn 2–3 ngày · "orange": còn 1 ngày hoặc hạn hôm nay
 * - "red": đã qua hạn mà người chủ trì CHƯA lưu báo cáo / ghi chú
 * - "past": đã qua hạn nhưng đã có cập nhật (không tô đỏ) · "muted": còn hơn 3 ngày
 */
export type WorkTaskDueTone = "muted" | "yellow" | "orange" | "red" | "past";

type UpdateCarrier = {
  report?: string | null;
  note?: string | null;
  links?: readonly unknown[] | null;
  reportUpdatedAt?: string | Date | null;
};

/**
 * Người chủ trì đã "cập nhật lưu thông tin" khi đã bấm lưu Cập nhật thực hiện (có reportUpdatedAt)
 * và còn nội dung báo cáo hoặc ghi chú/link. Ghi chú do người giao việc điền sẵn lúc tạo không tính.
 */
export function workTaskHasUpdate(task: UpdateCarrier) {
  if (!task.reportUpdatedAt) return false;
  return Boolean(task.report?.trim() || task.note?.trim() || (task.links?.length ?? 0) > 0);
}

export function workTaskDueHint(
  dueDate: string | null | undefined,
  hasUpdate: boolean,
  today = workTaskToday()
): { label: string; tone: WorkTaskDueTone; days: number } | null {
  const due = String(dueDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) {
    return hasUpdate
      ? { label: `Qua hạn ${-days} ngày · đã cập nhật`, tone: "past", days }
      : { label: `Quá hạn ${-days} ngày`, tone: "red", days };
  }
  if (days === 0) return { label: "Hạn hôm nay", tone: "orange", days };
  if (days === 1) return { label: "Còn 1 ngày", tone: "orange", days };
  if (days <= 3) return { label: `Còn ${days} ngày`, tone: "yellow", days };
  return { label: `Còn ${days} ngày`, tone: "muted", days };
}
