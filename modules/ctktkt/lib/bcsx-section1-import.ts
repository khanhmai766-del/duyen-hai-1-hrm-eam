import ExcelJS from "exceljs";

type Unit = "S1" | "S2";
type ShiftMetric = "P" | "Q" | "D" | "E";
const SHIFT_METRICS: Array<{ key: ShiftMetric; col: "B" | "C" | "D" | "E" }> = [
  { key: "P", col: "B" }, { key: "Q", col: "C" }, { key: "D", col: "D" }, { key: "E", col: "E" },
];
const SHIFT_TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let minutes = 30; minutes < 24 * 60; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  slots.push("23:59");
  return slots;
})();

export type Section1ImportEntry = { unit: Unit; timeSlot: string; metric: ShiftMetric; value: string };
export type Section1ImportDay = { date: string; entries: Section1ImportEntry[] };
export type Section1ImportPackage = {
  kind: "BCSX_SECTION_1_HISTORY";
  version: 1;
  month: string;
  throughDay: number;
  sources: Array<{ unit: Unit; fileName: string }>;
  totals: { days: number; entries: number; checks: number; passed: number; failed: number };
  days: Section1ImportDay[];
};

export type Section1WorkbookSource = {
  fileName: string;
  bytes: ArrayBuffer;
};

const sourceNamePattern = /(?:^|[\s_-])S([12])(?=[\s_.-]|$)/i;
const sourceDatePattern = /(\d{2})[.](\d{2})[.](\d{4})(?=\.xlsx$)/i;

export function identifySection1Workbook(fileName: string): { unit: Unit; month: string; throughDay: number } {
  const unitMatch = fileName.match(sourceNamePattern);
  const dateMatch = fileName.match(sourceDatePattern);
  if (!unitMatch || !dateMatch) {
    throw new Error(`Không nhận diện được tổ máy hoặc ngày trong tên file "${fileName}". Tên file cần có S1/S2 và ngày dạng DD.MM.YYYY.xlsx.`);
  }
  const [, day, month, year] = dateMatch;
  const throughDay = Number(day);
  const monthNumber = Number(month);
  if (throughDay < 1 || throughDay > 31 || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Ngày trong tên file "${fileName}" không hợp lệ.`);
  }
  return { unit: `S${unitMatch[1]}` as Unit, month: `${year}-${month}`, throughDay };
}

function readStorageValue(cell: ExcelJS.Cell, location: string): string {
  const raw = cell.value;
  if (raw && typeof raw === "object" && ("formula" in raw || "sharedFormula" in raw)) {
    throw new Error(`${location} là công thức; Mục 1 phải là dữ liệu nhập tay.`);
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(`${location} không phải số hợp lệ.`);
  }
  return String(raw);
}

function readSourceTime(cell: ExcelJS.Cell, location: string): string {
  if (cell.value instanceof Date) {
    return `${String(cell.value.getUTCHours()).padStart(2, "0")}:${String(cell.value.getUTCMinutes()).padStart(2, "0")}`;
  }
  const match = String(cell.value ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`${location} không có mốc giờ hợp lệ.`);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

async function extractSource(source: Section1WorkbookSource, unit: Unit, month: string, throughDay: number) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source.bytes);
  const byDate = new Map<string, Section1ImportEntry[]>();

  for (let day = 1; day <= throughDay; day += 1) {
    const sheetName = String(day).padStart(2, "0");
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`${source.fileName} thiếu sheet ${sheetName}.`);
    const entries: Section1ImportEntry[] = [];
    for (let index = 0; index < SHIFT_TIME_SLOTS.length; index += 1) {
      const row = 11 + index;
      const expectedTime = SHIFT_TIME_SLOTS[index];
      const actualTime = readSourceTime(sheet.getCell(`A${row}`), `${source.fileName}!${sheetName}!A${row}`);
      if (actualTime !== expectedTime) {
        throw new Error(`${source.fileName}!${sheetName}!A${row}: mốc ${actualTime}, cần ${expectedTime}.`);
      }
      for (const metric of SHIFT_METRICS) {
        const address = `${metric.col}${row}`;
        entries.push({
          unit,
          timeSlot: expectedTime,
          metric: metric.key,
          value: readStorageValue(sheet.getCell(address), `${source.fileName}!${sheetName}!${address}`),
        });
      }
    }
    byDate.set(`${month}-${sheetName}`, entries);
  }
  return byDate;
}

export async function buildSection1ImportPackage(sources: Section1WorkbookSource[]): Promise<Section1ImportPackage> {
  if (sources.length !== 2) throw new Error("Hãy chọn đồng thời đúng 2 file Excel BCSX: một file S1 và một file S2.");
  const identified = sources.map(source => ({ source, ...identifySection1Workbook(source.fileName) }));
  const units = new Set(identified.map(item => item.unit));
  if (units.size !== 2 || !units.has("S1") || !units.has("S2")) {
    throw new Error("Hai file phải gồm đúng một file S1 và một file S2.");
  }
  if (new Set(identified.map(item => `${item.month}-${item.throughDay}`)).size !== 1) {
    throw new Error("Hai file S1 và S2 phải có cùng ngày báo cáo trong tên file.");
  }

  const { month, throughDay } = identified[0];
  const extracted = await Promise.all(identified.map(async item => ({
    unit: item.unit,
    byDate: await extractSource(item.source, item.unit, month, throughDay),
  })));
  const byUnit = new Map(extracted.map(item => [item.unit, item.byDate]));
  const days: Section1ImportDay[] = [];

  for (let day = 1; day <= throughDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const entries = [...(byUnit.get("S1")?.get(date) || []), ...(byUnit.get("S2")?.get(date) || [])];
    const expectedCount = 2 * SHIFT_TIME_SLOTS.length * SHIFT_METRICS.length;
    if (entries.length !== expectedCount) throw new Error(`${date}: cần đúng ${expectedCount} giá trị Mục 1, nhận ${entries.length}.`);
    const unique = new Set(entries.map(entry => `${entry.unit}|${entry.timeSlot}|${entry.metric}`));
    if (unique.size !== entries.length) throw new Error(`${date}: có khóa Mục 1 trùng nhau.`);
    days.push({ date, entries });
  }

  const entryCount = days.reduce((sum, day) => sum + day.entries.length, 0);
  return {
    kind: "BCSX_SECTION_1_HISTORY",
    version: 1,
    month,
    throughDay,
    sources: identified.map(item => ({ unit: item.unit, fileName: item.source.fileName })),
    totals: { days: days.length, entries: entryCount, checks: entryCount, passed: entryCount, failed: 0 },
    days,
  };
}
