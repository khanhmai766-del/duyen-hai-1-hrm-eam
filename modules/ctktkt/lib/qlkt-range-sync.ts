// Đồng bộ dữ liệu ngày QLKT cho một khoảng ngày: web gửi lần lượt từng ngày cho tiện ích,
// nhận kết quả và lưu các mã đọc trực tiếp từ QLKT (giờ phát, thời gian vận hành, nhận lưới, tồn kho, nước).

export const QLKT_RANGE_SYNC_DEFAULT_FROM = "2026-01-01";
export const QLKT_RANGE_SYNC_MAX_DAYS = 400;

export function listIsoDates(from: string, to: string) {
  const dates: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return dates;
  const [year, month, day] = from.split("-").map(Number);
  for (let cursor = new Date(Date.UTC(year, month - 1, day)); ; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso > to || dates.length >= QLKT_RANGE_SYNC_MAX_DAYS) break;
    dates.push(iso);
  }
  return dates;
}

/** Các ô cần lưu cho một ngày: bỏ ô QLKT để trống, giữ nguyên ghi chú đang có của ô đó. */
export function buildQlktRangeEntries(
  operatingDate: string,
  entries: ReadonlyArray<{ fieldCode: string; value: string }>,
  existingNotes: ReadonlyMap<string, string>,
) {
  return entries
    .filter(entry => entry.value !== "")
    .map(entry => ({
      operatingDate,
      fieldCode: entry.fieldCode,
      value: entry.value,
      note: existingNotes.get(`${operatingDate}|${entry.fieldCode}`) || "",
    }));
}
