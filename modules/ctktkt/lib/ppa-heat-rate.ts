export type MeterReading = {
  meter: string;
  channel: string;
  operatingDate: string;
  total: number;
  intervals: number[];
  sourceName?: string;
};

export type PpaSourceData = {
  grossS1: number[];
  netS1: number[];
  grossS2: number[];
  netS2: number[];
};

export type PpaResult = {
  ppaPlant: number;
  ppaS1: number;
  ppaS2: number;
  grossS1Kwh: number;
  netS1Kwh: number;
  grossS2Kwh: number;
  netS2Kwh: number;
};

export const CAPACITY_KW = { full: 622_500, seventyFive: 466_875, half: 311_266 };
const BASE_PPA_2016 = { full: 10_122.020443242285, seventyFive: 10_351.657211200063, half: 10_882.50751103315 };
const ANNUAL_DEGRADATION = 0.000896551724137939;

const cleanText = (value: string) => value.replace(/^\uFEFF/, "").trim();
const normalizeText = (value: string) => cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const meterKey = (meter: string, channel: string) => `${meter.replace(/\s+/g, "").toUpperCase()}|${channel.replace(/\s+/g, "").toUpperCase()}`;

export function parseLocaleNumber(raw: string): number | null {
  let value = cleanText(raw).replace(/[\s\u00a0]/g, "");
  if (!value) return null;
  const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    value = decimal === "," ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (comma >= 0) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if ((value.match(/\./g) || []).length > 1) {
    const parts = value.split(".");
    value = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(current); current = ""; }
    else current += char;
  }
  cells.push(current);
  return cells.map(cleanText);
}

function detectDelimiter(lines: string[]) {
  const candidate = lines.find(line => normalizeText(line).includes("ten diem do")) || lines[0] || "";
  return ["\t", ";", ","].map(delimiter => ({ delimiter, count: splitDelimitedLine(candidate, delimiter).length })).sort((a, b) => b.count - a.count)[0].delimiter;
}

function normalizeDate(raw: string) {
  const match = cleanText(raw).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

const compactMeterCodes: Record<string, string> = {
  "6001": "DHA_S1",
  "6002": "DHA_S2",
  "6301": "DH1_283M",
  "6303": "DH1_285M",
};

function meterFromCompactFileName(sourceName: string) {
  const fileName = sourceName.split(/[\\/]/).at(-1)?.replace(/\.csv$/i, "") || "";
  const match = fileName.match(/(6001|6002|6301|6303)(?:\s*\(\d+\))?$/i);
  return match ? compactMeterCodes[match[1]] : "";
}

function parseCompactMeterCsv(rows: string[][], sourceName: string) {
  const meter = meterFromCompactFileName(sourceName);
  if (!meter) {
    throw new Error(`${sourceName}: CSV rút gọn chưa có “Tên điểm đo”. Tên file phải kết thúc bằng 6001, 6002, 6301 hoặc 6303.`);
  }
  const row = rows.find(candidate => normalizeText(candidate[1] || "") === "kwhgiao");
  if (!row) throw new Error(`${sourceName}: không tìm thấy dòng KwhGiao.`);
  if (row.length < 50) throw new Error(`${sourceName}: dòng KwhGiao chưa đủ 48 chu kỳ nửa giờ.`);
  const operatingDate = normalizeDate(row[0] || "");
  if (!operatingDate) throw new Error(`${sourceName}: ngày báo cáo không hợp lệ.`);
  const intervals = row.slice(2, 50).map(value => parseLocaleNumber(value));
  if (intervals.some(value => value === null || value < 0)) throw new Error(`${sourceName}: có giá trị KwhGiao không hợp lệ.`);
  const numericIntervals = intervals as number[];
  return [{
    meter,
    channel: "kWhGiao",
    operatingDate,
    total: numericIntervals.reduce((sum, value) => sum + value, 0),
    intervals: numericIntervals,
    sourceName,
  }] satisfies MeterReading[];
}

export function parseMeterCsv(text: string, sourceName = "Dữ liệu dán") {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(line => line.trim());
  if (!lines.length) return [] as MeterReading[];
  const delimiter = detectDelimiter(lines);
  const rows = lines.map(line => splitDelimitedLine(line, delimiter));
  const headerIndex = rows.findIndex(row => row.some(cell => normalizeText(cell) === "ten diem do") && row.some(cell => normalizeText(cell) === "kenh"));
  if (headerIndex < 0) return parseCompactMeterCsv(rows, sourceName);
  const header = rows[headerIndex].map(normalizeText);
  const meterIndex = header.findIndex(cell => cell === "ten diem do");
  const channelIndex = header.findIndex(cell => cell === "kenh");
  const dateIndex = header.findIndex(cell => cell === "ngay");
  const totalIndex = header.findIndex(cell => cell === "tong");
  const hourIndexes = Array.from({ length: 48 }, (_, index) => header.findIndex(cell => cell.toUpperCase() === `H${index + 1}`));
  if (meterIndex < 0 || channelIndex < 0 || hourIndexes.some(index => index < 0)) throw new Error(`${sourceName}: cấu trúc CSV chưa đủ 48 chu kỳ H1–H48.`);

  const readings: MeterReading[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const meter = cleanText(row[meterIndex] || ""), channel = cleanText(row[channelIndex] || "");
    if (!meter || !channel) continue;
    const intervals = hourIndexes.map(index => parseLocaleNumber(row[index] || ""));
    if (intervals.some(value => value === null)) continue;
    const numericIntervals = intervals as number[];
    const reportedTotal = totalIndex >= 0 ? parseLocaleNumber(row[totalIndex] || "") : null;
    readings.push({ meter, channel, operatingDate: dateIndex >= 0 ? normalizeDate(row[dateIndex] || "") : "", total: reportedTotal ?? numericIntervals.reduce((sum, value) => sum + value, 0), intervals: numericIntervals, sourceName });
  }
  if (!readings.length) throw new Error(`${sourceName}: không đọc được dòng số liệu công tơ nào.`);
  return readings;
}

export function mergeMeterReadings(groups: MeterReading[][]) {
  const merged = new Map<string, MeterReading>();
  for (const reading of groups.flat()) {
    const key = meterKey(reading.meter, reading.channel);
    const existing = merged.get(key);
    if (existing && existing.intervals.some((value, index) => Math.abs(value - reading.intervals[index]) > 0.001)) throw new Error(`Dữ liệu trùng nhưng khác giá trị tại ${reading.meter} / ${reading.channel}.`);
    merged.set(key, reading);
  }
  return merged;
}

export const requiredPpaMeters = [
  { key: "grossS1", label: "Sản lượng đầu cực S1", meter: "DHA_S1", channel: "kWhGiao" },
  { key: "netS1", label: "Sản lượng điểm bán S1", meter: "DH1_285M", channel: "kWhGiao" },
  { key: "grossS2", label: "Sản lượng đầu cực S2", meter: "DHA_S2", channel: "kWhGiao" },
  { key: "netS2", label: "Sản lượng điểm bán S2", meter: "DH1_283M", channel: "kWhGiao" },
] as const;

export function selectPpaSource(readings: Map<string, MeterReading>) {
  const selected: Partial<PpaSourceData> = {};
  const found = requiredPpaMeters.map(item => {
    const reading = readings.get(meterKey(item.meter, item.channel));
    if (reading) selected[item.key] = reading.intervals;
    return { ...item, found: Boolean(reading), sourceName: reading?.sourceName || "" };
  });
  return { source: found.every(item => item.found) ? selected as PpaSourceData : null, found };
}

function interpolate(x: number, x1: number, y1: number, x2: number, y2: number) {
  return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
}

export function ppaCurveForYear(year: number) {
  if (!Number.isInteger(year) || year < 2016 || year > 2045) throw new Error("Đường PPA trong file chỉ được xác lập cho giai đoạn 2016–2045.");
  const factor = 1 + (year - 2016) * ANNUAL_DEGRADATION;
  return { full: BASE_PPA_2016.full * factor, seventyFive: BASE_PPA_2016.seventyFive * factor, half: BASE_PPA_2016.half * factor };
}

export type IntervalDetail = { grossKwh: number; netKwh: number; rate: number; heatKj: number };
export type UnitDetail = { heat: number; netTotal: number; grossTotal: number; ppa: number; intervals: IntervalDetail[] };
export type PpaDetailedResult = { s1: UnitDetail; s2: UnitDetail; ppaPlant: number };

function calculateUnit(gross: number[], net: number[], year: number, unitLabel: "S1" | "S2"): UnitDetail {
  if (gross.length !== 48 || net.length !== 48 || [...gross, ...net].some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Dữ liệu ${unitLabel} phải có đủ 48 giá trị nửa giờ không âm.`);
  }
  const curve = ppaCurveForYear(year);
  let heat = 0, netTotal = 0;
  const intervals: IntervalDetail[] = [];
  for (let index = 0; index < 48; index += 1) {
    const loadKw = gross[index] * 2;
    const rate = gross[index] > CAPACITY_KW.seventyFive / 2
      ? interpolate(loadKw, CAPACITY_KW.full, curve.full, CAPACITY_KW.seventyFive, curve.seventyFive)
      : interpolate(loadKw, CAPACITY_KW.seventyFive, curve.seventyFive, CAPACITY_KW.half, curve.half);
    const heatKj = rate * net[index];
    heat += heatKj;
    netTotal += net[index];
    intervals.push({ grossKwh: gross[index], netKwh: net[index], rate, heatKj });
  }
  const grossTotal = gross.reduce((sum, value) => sum + value, 0);
  if (netTotal <= 0) {
    if (grossTotal <= 0) return { heat: 0, netTotal: 0, grossTotal: 0, ppa: 0, intervals };
    throw new Error(`Tổng sản lượng điểm bán ${unitLabel} đang bằng 0 trong khi đầu cực vẫn có dữ liệu. Hãy kiểm tra công tơ ${unitLabel} trên QLKT.`);
  }
  return { heat, netTotal, grossTotal, ppa: heat / netTotal, intervals };
}

export function calculatePpaHeatRate(source: PpaSourceData, year: number): PpaResult {
  const s1 = calculateUnit(source.grossS1, source.netS1, year, "S1"), s2 = calculateUnit(source.grossS2, source.netS2, year, "S2");
  const plantNetTotal = s1.netTotal + s2.netTotal;
  if (plantNetTotal <= 0) throw new Error("Tổng sản lượng điểm bán của cả S1 và S2 đang bằng 0.");
  return { ppaPlant: (s1.heat + s2.heat) / plantNetTotal, ppaS1: s1.ppa, ppaS2: s2.ppa, grossS1Kwh: s1.grossTotal, netS1Kwh: s1.netTotal, grossS2Kwh: s2.grossTotal, netS2Kwh: s2.netTotal };
}

// Bản chi tiết theo từng chu kỳ 30 phút (48 chu kỳ/ngày) của tổ máy S1/S2 — dùng để
// tái tạo các sheet "S1"/"S2" giống file mẫu gốc khi xuất Excel (không đổi kết quả
// calculatePpaHeatRate ở trên, chỉ bổ sung thêm chi tiết nội bộ từng chu kỳ).
export function calculatePpaHeatRateDetailed(source: PpaSourceData, year: number): PpaDetailedResult {
  const s1 = calculateUnit(source.grossS1, source.netS1, year, "S1"), s2 = calculateUnit(source.grossS2, source.netS2, year, "S2");
  const plantNetTotal = s1.netTotal + s2.netTotal;
  if (plantNetTotal <= 0) throw new Error("Tổng sản lượng điểm bán của cả S1 và S2 đang bằng 0.");
  return { s1, s2, ppaPlant: (s1.heat + s2.heat) / plantNetTotal };
}

export function calculateActualHeatRate(values: Record<string, string>) {
  const read = (code: string) => parseLocaleNumber(values[code] || "");
  const netS1 = read("C"), netS2 = read("I");
  const coalS1 = read("AE_ADJ") ?? read("AE"), coalS2 = read("AF_ADJ") ?? read("AF"), heatingValue = read("AJ");
  if ([netS1, netS2, coalS1, coalS2, heatingValue].some(value => value === null)) return null;
  // Reproduce QLKT report 02-PD: its "suất hao nhiệt thô/tinh" is coal heat
  // input only (coal mass × coal HHV). QLKT does not add HFO/DO heat to this
  // indicator, including on 06/08/2026 when S1 recorded 206.3441 t HFO.
  // Oil remains a separately tracked consumption input and must not be mixed
  // into the QLKT-comparable heat-rate result.
  const plantNet = netS1! + netS2!;
  if (plantNet <= 0) return null;
  const officialPlant = read("Q181");
  const calculatedPlant = (coalS1! + coalS2!) * heatingValue! / (plantNet * 1000);
  let s1 = netS1! > 0 ? coalS1! * heatingValue! / (netS1! * 1000) : null;
  let s2 = netS2! > 0 ? coalS2! * heatingValue! / (netS2! * 1000) : null;
  if (officialPlant !== null && officialPlant > 0) {
    if (netS1! <= 0 && netS2! > 0) s2 = officialPlant;
    if (netS2! <= 0 && netS1! > 0) s1 = officialPlant;
  }
  return { actualPlant: officialPlant !== null && officialPlant > 0 ? officialPlant : calculatedPlant, actualS1: s1, actualS2: s2 };
}

export function compareHeatRate(actual: number | null, ppa: number | null) {
  if (actual === null || ppa === null || ppa === 0) return { difference: null, percent: null, status: "Chưa đủ dữ liệu" };
  const difference = actual - ppa;
  return { difference, percent: difference / ppa * 100, status: difference <= 0 ? "Đạt" : "Vượt PPA" };
}
