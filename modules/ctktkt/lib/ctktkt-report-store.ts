import { prisma } from "@/lib/prisma";

/**
 * Các lượt đọc dùng chung của Chỉ tiêu KTKT (route báo cáo, file xuất Excel — cũng là nguồn Google Mirror) bằng Prisma
 * — giai đoạn 3. Trả đúng dạng hàng mà các câu SQL cũ trả (tên cột viết kiểu camelCase như `AS …`).
 */
type CellRow = { operatingDate: string; cell: string; value: string };

/** Ô Chỉ tiêu KTKT ("KTKT:<ô>" → cell = <ô>, như substr(field_code, 6)) trong [from, next). */
export async function loadKtktCells(from: string, next: string, order: "date-field" | "field" = "date-field"): Promise<CellRow[]> {
  const rows = await prisma.ctktktDailyInputs.findMany({
    where: { operating_date: { gte: from, lt: next }, field_code: { startsWith: "KTKT:" } },
    orderBy: order === "field" ? { field_code: "asc" } : [{ operating_date: "asc" }, { field_code: "asc" }],
    select: { operating_date: true, field_code: true, value: true },
  });
  return rows.map(r => ({ operatingDate: r.operating_date, cell: r.field_code.slice(5), value: r.value }));
}

/** Ô dữ liệu ngày có mã trong `codes` (không bỏ tiền tố), theo ngày rồi mã ô. */
export async function loadDailyCodes(from: string, next: string, codes: readonly string[]): Promise<CellRow[]> {
  const rows = await prisma.ctktktDailyInputs.findMany({
    where: { operating_date: { gte: from, lt: next }, field_code: { in: [...codes] } },
    orderBy: [{ operating_date: "asc" }, { field_code: "asc" }],
    select: { operating_date: true, field_code: true, value: true },
  });
  return rows.map(r => ({ operatingDate: r.operating_date, cell: r.field_code, value: r.value }));
}

/** Mọi ô dữ liệu ngày trong [from, next), theo ngày rồi mã ô (file xuất). */
export async function loadDailyRange(from: string, next: string) {
  const rows = await prisma.ctktktDailyInputs.findMany({
    where: { operating_date: { gte: from, lt: next } },
    orderBy: [{ operating_date: "asc" }, { field_code: "asc" }],
    select: { operating_date: true, field_code: true, value: true },
  });
  return rows.map(r => ({ operatingDate: r.operating_date, fieldCode: r.field_code, value: r.value }));
}

/** Số liệu nửa giờ BCSX trong [from, next), theo ngày, tổ máy, mốc giờ, thông số. */
export async function loadShiftReadingsRange(from: string, next: string) {
  const rows = await prisma.ctktktShiftReadings.findMany({
    where: { operating_date: { gte: from, lt: next } },
    orderBy: [{ operating_date: "asc" }, { unit: "asc" }, { time_slot: "asc" }, { metric: "asc" }],
    select: { operating_date: true, unit: true, time_slot: true, metric: true, value: true },
  });
  return rows.map(r => ({ operatingDate: r.operating_date, unit: r.unit, timeSlot: r.time_slot, metric: r.metric, value: r.value }));
}

const SHIFT_RANK: Record<string, number> = { "06h00": 1, "14h00": 2, "22h00": 3 };
/** Sổ nước trong [from, next): theo ngày rồi ca 06h→14h→22h, giờ lạ cuối (= ORDER BY log_date, CASE shift_time …). */
export async function loadWaterLinkRows(from: string, next: string) {
  const rows = await prisma.ctktktWaterShiftLogs.findMany({
    where: { log_date: { gte: from, lt: next } },
    orderBy: [{ log_date: "asc" }, { id: "asc" }],
    select: { log_date: true, shift_time: true, water_rec_s1: true, water_rec_s2: true, resin_water_s1_24h: true, resin_water_s2_24h: true },
  });
  const sorted: typeof rows = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[j].log_date === rows[i].log_date) j++;
    sorted.push(...rows.slice(i, j).sort((a, b) => (SHIFT_RANK[a.shift_time] ?? 9) - (SHIFT_RANK[b.shift_time] ?? 9)));
    i = j;
  }
  return sorted.map(r => ({
    logDate: r.log_date, shiftTime: r.shift_time, waterRecS1: r.water_rec_s1, waterRecS2: r.water_rec_s2,
    resinWaterS1_24h: r.resin_water_s1_24h, resinWaterS2_24h: r.resin_water_s2_24h,
  }));
}
