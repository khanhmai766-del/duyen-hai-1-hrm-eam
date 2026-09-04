import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateInput(date: Date | string | null | undefined = new Date()): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateTimeInput(date: Date | string | null | undefined = new Date()): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return `${formatDateInput(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function parseDateInput(date: Date | string | null | undefined): Date {
  if (date instanceof Date) return new Date(date);
  if (typeof date === "string") {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(date);
  }
  return new Date();
}

/**
 * Parse giá trị từ input `datetime-local` theo múi giờ Việt Nam.
 *
 * Input này không mang offset. Server production chạy UTC nên `new Date(value)` sẽ
 * hiểu nhầm 16:00 Việt Nam thành 16:00 UTC và trình duyệt hiển thị lại thành 23:00.
 * Chuỗi đã có `Z`/offset vẫn được giữ đúng nghĩa thời điểm tuyệt đối.
 */
export function parseVietnamDateTimeInput(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return new Date(value);
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) return new Date(raw);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"));
  // Kiểm tra ngày/giờ trước khi trừ UTC+7; Date.UTC tự cuộn ngày không hợp lệ.
  const localCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    localCheck.getUTCFullYear() !== year
    || localCheck.getUTCMonth() !== month - 1
    || localCheck.getUTCDate() !== day
    || localCheck.getUTCHours() !== hour
    || localCheck.getUTCMinutes() !== minute
    || localCheck.getUTCSeconds() !== second
  ) return new Date(Number.NaN);

  return new Date(localCheck.getTime() - VN_OFFSET_MS);
}

export function dateRange(date: Date | string | null | undefined): { start: Date; end: Date } {
  const start = parseDateInput(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ── Tiện ích GIỜ VIỆT NAM (server chạy UTC) ──
// Dùng khi cần so "bây giờ / hôm nay" theo giờ VN thay vì giờ server.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "Bây giờ" quy về giờ VN — đọc bằng getUTCHours()/getUTCMinutes()… để lấy giá trị theo VN. */
export function vietnamNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + VN_OFFSET_MS);
}

/** UTC-midnight của NGÀY VIỆT NAM hôm nay — khớp cách lưu date-only (parseDateInput trên server UTC). */
export function vietnamTodayUtcMidnight(now: Date = new Date()): Date {
  const vn = vietnamNow(now);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay = 300
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
