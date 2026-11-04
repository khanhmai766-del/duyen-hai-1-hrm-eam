import ExcelJS from "exceljs";
import type { WaterShiftLog } from "./calculations";

export type SheetScanItem = {
  sheetName: string;
  month: string; // 'YYYY-MM'
  shiftCount: number;
  firstDate: string;
  lastDate: string;
};

function safeNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "object" && v !== null && "result" in v) {
    v = (v as { result?: unknown }).result;
  }
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function parseCellDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, "0")}-${ddmmyyyy[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  return null;
}

function getPreviousIsoDate(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseSheetShifts(ws: ExcelJS.Worksheet): WaterShiftLog[] {
  const shifts: WaterShiftLog[] = [];
  let lastDate: string | null = null;

  ws.eachRow((row, rowIdx) => {
    if (rowIdx >= 3) {
      const timeVal = String(row.getCell(2).value || "").trim();
      if (["06h00", "14h00", "22h00"].includes(timeVal)) {
        const d = parseCellDate(row.getCell(1).value);
        if (d) {
          lastDate = d;
        }

        shifts.push({
          logDate: d || lastDate || "",
          shiftTime: timeVal as "06h00" | "14h00" | "22h00",
          shiftTeam: String(row.getCell(3).value || "").trim().toUpperCase(),
          shiftLeader: String(row.getCell(4).value || "").trim(),
          elecRecS1: safeNum(row.getCell(5).value),
          elecRecS2: safeNum(row.getCell(6).value),
          elecGenS1: 0,
          elecGenS2: 0,
          waterRecS1: safeNum(row.getCell(9).value),
          waterRecS2: safeNum(row.getCell(10).value),
          waterUsedS1: 0,
          waterUsedS2: 0,
          waterRatioS1: 0,
          waterRatioS2: 0,
          condenserRecS1: safeNum(row.getCell(15).value),
          condenserRecS2: safeNum(row.getCell(16).value),
          condenserUsedS1: 0,
          condenserUsedS2: 0,
          resinWaterS1_24h: safeNum(row.getCell(19).value),
          resinWaterS2_24h: safeNum(row.getCell(20).value),
        });
      }
    }
  });

  // Nếu ca đầu tiên (baseline) thiếu ngày nhưng ca thứ 2 có ngày, tính lùi 1 ngày
  if (shifts.length > 1 && !shifts[0].logDate && shifts[1].logDate) {
    shifts[0].logDate = getPreviousIsoDate(shifts[1].logDate);
  }

  return shifts.filter(s => s.logDate && s.shiftTime);
}

export async function scanWorkbookBuffer(buffer: ArrayBuffer | Buffer): Promise<SheetScanItem[]> {
  const wb = new ExcelJS.Workbook();
  // @ts-expect-error ExcelJS supports both Buffer and ArrayBuffer
  await wb.xlsx.load(buffer);

  const results: SheetScanItem[] = [];

  wb.worksheets.forEach(ws => {
    const shifts = parseSheetShifts(ws);
    if (shifts.length > 0) {
      // Tìm tháng chiếm đa số trong sheet
      const monthCounts: Record<string, number> = {};
      for (const s of shifts) {
        const m = s.logDate.slice(0, 7);
        monthCounts[m] = (monthCounts[m] || 0) + 1;
      }
      const sortedMonths = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
      const dominantMonth = sortedMonths[0]?.[0] || shifts[0].logDate.slice(0, 7);

      results.push({
        sheetName: ws.name,
        month: dominantMonth,
        shiftCount: shifts.length,
        firstDate: shifts[0].logDate,
        lastDate: shifts[shifts.length - 1].logDate,
      });
    }
  });

  return results;
}

export async function extractWorkbookShifts(
  buffer: ArrayBuffer | Buffer,
  targetSheets?: string[]
): Promise<{ shifts: WaterShiftLog[]; months: string[] }> {
  const wb = new ExcelJS.Workbook();
  // @ts-expect-error ExcelJS supports both Buffer and ArrayBuffer
  await wb.xlsx.load(buffer);

  const shiftMap = new Map<string, WaterShiftLog>();
  const sheetsToProcess = targetSheets && targetSheets.length > 0
    ? wb.worksheets.filter(ws => targetSheets.includes(ws.name))
    : wb.worksheets;

  for (const ws of sheetsToProcess) {
    const shifts = parseSheetShifts(ws);
    for (const s of shifts) {
      const key = `${s.logDate}_${s.shiftTime}`;
      const existing = shiftMap.get(key);
      // Giữ bản ghi đầy đủ cột hơn (nếu sheet GỘP có thêm thông tin bình ngưng / tái sinh)
      if (!existing || (s.condenserRecS1 > 0 || s.resinWaterS1_24h > 0 || s.resinWaterS2_24h > 0)) {
        shiftMap.set(key, s);
      }
    }
  }

  const allShifts = Array.from(shiftMap.values()).sort((a, b) => {
    const ordA = a.shiftTime === "06h00" ? 1 : a.shiftTime === "14h00" ? 2 : 3;
    const ordB = b.shiftTime === "06h00" ? 1 : b.shiftTime === "14h00" ? 2 : 3;
    return `${a.logDate}_${ordA}`.localeCompare(`${b.logDate}_${ordB}`);
  });

  const monthSet = new Set<string>();
  for (const s of allShifts) {
    monthSet.add(s.logDate.slice(0, 7));
  }

  return {
    shifts: allShifts,
    months: Array.from(monthSet).sort(),
  };
}
