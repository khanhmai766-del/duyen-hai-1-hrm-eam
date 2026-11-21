import { calculateDailyProduction } from "./daily-production-calculations";
import { addDaysIso } from "./operating-date";

export const STATISTICS_MODES = [
  { value: "year", label: "Theo năm" },
  { value: "quarter", label: "Theo quý" },
  { value: "month", label: "Theo tháng" },
  { value: "week", label: "Theo tuần" },
  { value: "day", label: "Theo ngày" },
] as const;

export type StatisticsMode = (typeof STATISTICS_MODES)[number]["value"];
export type StatisticsRange = { from: string; to: string };
export type StatisticsRequest = StatisticsRange & { mode: StatisticsMode };

export function statisticsDateLabel(date: string) {
  return date.split("-").reverse().join("/");
}

/** Tuần từ thứ Hai tới Chủ nhật. Kỳ đang diễn ra chỉ tính đến ngày vận hành đã kết thúc. */
export function statisticsPeriod(mode: StatisticsMode, anchor: string, latest: string): StatisticsRange {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") {
    const weekday = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    const from = addDaysIso(anchor, -((weekday + 6) % 7));
    const end = addDaysIso(from, 6);
    return { from, to: end < latest ? end : latest };
  }
  const firstMonth = mode === "year" ? 0 : mode === "quarter" ? Math.floor((month - 1) / 3) * 3 : month - 1;
  const length = mode === "year" ? 12 : mode === "quarter" ? 3 : 1;
  const from = new Date(Date.UTC(year, firstMonth, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, firstMonth + length, 0)).toISOString().slice(0, 10);
  return { from, to: end < latest ? end : latest };
}

export const STATISTICS_GROUPS = [
  {
    id: "production", label: "Chỉ tiêu KTKT",
    columns: [
      ["grossS1", "Điện đầu cực S1", "MWh"],
      ["grossS2", "Điện đầu cực S2", "MWh"],
      ["N", "Tổng điện đầu cực", "MWh"],
      ["O", "Điện điểm bán", "MWh"],
      ["P", "Điện tự dùng gồm điện nhận", "MWh"],
      ["Q", "Tỷ lệ điện tự dùng", "%"],
      ["W", "Suất hao nhiệt tinh", "kJ/kWh"],
      ["coal", "Than quy ẩm 8,5%", "tấn"],
      ["AT", "Than nhập theo PMIS", "tấn"],
      ["AR", "Tồn than 06h ngày cuối kỳ", "tấn"],
      ["X", "Dầu FO tiêu thụ", "tấn"],
    ],
  },
  {
    id: "environment", label: "Chỉ tiêu phụ",
    columns: [
      ["BN", "NH₃ theo mức bồn", "tấn"],
      ["BQ", "NH₃ DCS S1", "tấn"],
      ["BR", "NH₃ DCS S2", "tấn"],
      ["CN", "NH₃ nhập", "tấn"],
      ["BZ", "Xả xỉ S1", "tấn"],
      ["CA", "Xả xỉ S2", "tấn"],
      ["CC", "Nước bổ sung S1", "m³"],
      ["CD", "Nước bổ sung S2", "m³"],
      ["CE", "Nước tái sinh S1", "m³"],
      ["CF", "Nước tái sinh S2", "m³"],
      ["CM", "Bi nghiền bổ sung", "kg"],
    ],
  },
  {
    id: "operation", label: "Thời gian vận hành",
    columns: [
      ["F", "Giờ phát S1", "giờ"],
      ["L", "Giờ phát S2", "giờ"],
      ["R", "Tổng giờ phát", "giờ"],
      ["CS", "Thời gian dự phòng", "giờ"],
      ["CT", "Thời gian sự cố", "giờ"],
      ["CU", "Thời gian sửa chữa/bảo dưỡng", "giờ"],
      ["maintenanceRate", "Tỷ lệ SCBD theo giờ lịch", "%"],
      ["CV", "Thời gian khởi động", "giờ"],
      ["CQ", "Hơi cấp VH2", "tấn"],
    ],
  },
] as const;

export type StatisticsGroup = (typeof STATISTICS_GROUPS)[number];
type Values = Record<string, number | null>;
type Entry = { operatingDate: string; fieldCode: string; value: string };
type Day = { date: string; values: Values };
export type StatisticsRow = StatisticsRange & {
  label: string;
  values: Values;
  coverage: Record<StatisticsGroup["id"], number>;
  days: number;
};

const rawCodes = ["AT", "AR", "X", "BN", "BQ", "BR", "CN", "BZ", "CA", "CC", "CD", "CE", "CF", "CM", "F", "L", "CS", "CT", "CU", "CV", "CQ"];

function numberValue(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function scale(value: number | null, factor: number) {
  return value === null ? null : value * factor;
}

function dailyValues(input: Record<string, string>): Values {
  const daily = calculateDailyProduction(input);
  return {
    ...Object.fromEntries(rawCodes.map(code => [code, numberValue(input[code])])),
    grossS1: scale(numberValue(input.B), 1000),
    grossS2: scale(numberValue(input.H), 1000),
    N: daily.N, O: daily.O, P: daily.P, Q: daily.Q, W: daily.W, R: daily.R,
    coal: daily.AE_ADJ === null || daily.AF_ADJ === null ? null : daily.AE_ADJ + daily.AF_ADJ,
  };
}

function sum(days: readonly Day[], code: string) {
  const numbers = days.map(day => day.values[code]).filter((value): value is number => value != null);
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
}

function weightedMean(days: readonly Day[], code: "Q" | "W", weight: "N" | "O") {
  const generating = days.filter(day => (day.values[weight] ?? 0) > 0);
  if (!generating.length || generating.some(day => day.values[code] == null)) return null;
  const totalWeight = generating.reduce((total, day) => total + (day.values[weight] ?? 0), 0);
  const weighted = generating.reduce((total, day) => total + (day.values[code] ?? 0) * (day.values[weight] ?? 0), 0);
  return weighted / totalWeight;
}

function summarize(days: readonly Day[], label: string): StatisticsRow {
  const first = days[0];
  const last = days[days.length - 1];
  const values: Values = {};
  const coverage: StatisticsRow["coverage"] = { production: 0, environment: 0, operation: 0 };
  for (const group of STATISTICS_GROUPS) {
    coverage[group.id] = days.filter(day => group.columns.some(([code]) => day.values[code] != null)).length;
    for (const [code] of group.columns) values[code] = sum(days, code);
  }
  values.AR = last.values.AR;
  values.Q = weightedMean(days, "Q", "N");
  values.W = weightedMean(days, "W", "O");
  // DH1 có hai tổ máy. Chỉ tính tỷ lệ khi mọi ngày trong kỳ có số giờ SCBD, kể cả số 0.
  values.maintenanceRate = days.every(day => day.values.CU != null)
    ? (values.CU ?? 0) / (days.length * 24 * 2) * 100
    : null;
  return { label, from: first.date, to: last.date, values, coverage, days: days.length };
}

export function buildPeriodStatistics(entries: readonly Entry[], request: StatisticsRequest) {
  const byDate = new Map<string, Record<string, string>>();
  for (const { operatingDate, fieldCode, value } of entries) {
    if (operatingDate < request.from || operatingDate > request.to) continue;
    const row = byDate.get(operatingDate) ?? {};
    row[fieldCode] = value;
    byDate.set(operatingDate, row);
  }

  const days: Day[] = [];
  const buckets = new Map<string, Day[]>();
  const monthly = request.mode === "year" || request.mode === "quarter";
  for (let date = request.from; date <= request.to; date = addDaysIso(date, 1)) {
    const day = { date, values: dailyValues(byDate.get(date) ?? {}) };
    const key = monthly ? date.slice(0, 7) : date;
    days.push(day);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(day);
    else buckets.set(key, [day]);
  }

  const rows = Array.from(buckets, ([key, bucket]) => summarize(bucket,
    monthly ? `Tháng ${key.slice(5)}/${key.slice(0, 4)}` : statisticsDateLabel(key),
  ));
  return { rows, total: summarize(days, "Tổng hợp kỳ") };
}

export function statisticsSheetRows(
  report: ReturnType<typeof buildPeriodStatistics>,
  request: StatisticsRequest,
  group: StatisticsGroup,
) {
  const label = STATISTICS_MODES.find(mode => mode.value === request.mode)?.label;
  return [
    [`THỐNG KÊ DH1 · ${group.label}`],
    [label, "Từ ngày", statisticsDateLabel(request.from), "Đến ngày", statisticsDateLabel(request.to)],
    ["Kỳ", "Từ ngày", "Đến ngày", "Ngày có số liệu", "Số ngày trong kỳ",
      ...group.columns.map(([, name, unit]) => `${name} (${unit})`)],
    ...[...report.rows, report.total].map(row => [
      row.label, statisticsDateLabel(row.from), statisticsDateLabel(row.to), row.coverage[group.id], row.days,
      ...group.columns.map(([code]) => row.values[code]),
    ]),
  ];
}
