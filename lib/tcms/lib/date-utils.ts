/**
 * TCMS Date Utilities
 * Handles deterministic conversions between internal ISO dates (YYYY-MM-DD)
 * and Vietnamese display dates (DD/MM/YYYY).
 */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 0;
  }
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

export function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > getDaysInMonth(year, month)) return false;
  return true;
}

/**
 * Converts ISO string YYYY-MM-DD to display string DD/MM/YYYY.
 * Returns empty string if input is null, undefined, or empty.
 */
export function isoToDisplayDate(isoDate?: string | null): string {
  if (!isoDate || typeof isoDate !== "string") return "";
  const trimmed = isoDate.trim();
  if (!trimmed) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidDateParts(year, month, day)) return "";

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`;
}

/**
 * Parses user input in DD/MM/YYYY (or D/M/YYYY) format to ISO YYYY-MM-DD.
 * Returns:
 * - ISO string "YYYY-MM-DD" if valid.
 * - "" (empty string) if input is empty or whitespace.
 * - null if input is provided but invalid (e.g. 29/02/2027 or 31/04/2026).
 */
export function displayToIsoDate(displayDate?: string | null): string | null {
  if (displayDate === null || displayDate === undefined) return "";
  if (typeof displayDate !== "string") return null;
  const trimmed = displayDate.trim();
  if (!trimmed) return "";

  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (!isValidDateParts(year, month, day)) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Formats an ISO string, Date object, or timestamp strictly as DD/MM/YYYY for UI text display.
 * Returns "-" for empty/null/undefined/invalid values.
 */
export function formatDate(value?: string | Date | null): string {
  if (!value) return "-";

  if (typeof value === "string") {
    const formatted = isoToDisplayDate(value);
    if (formatted) return formatted;

    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const parsed = isoToDisplayDate(`${match[1]}-${match[2]}-${match[3]}`);
      if (parsed) return parsed;
    }
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) return "-";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}
