import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { normalizePosition, type PcccMachine } from "../lib/pccc-position";
import { normalizeText } from "../lib/nav";
import { periodLabelOf, vietnamClock } from "../lib/pccc-clock";

const DEFAULT_FILE = "C:/Users/Asus/OneDrive/Desktop/FM200.xlsx";
const REQUIRED_HEADERS = ["Hệ thống", "Mã thiết bị", "Vị trí hiện tại", "Cương vị quản lý", "Trình trạng", "Ghi chú"];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function machineOf(...values: string[]): PcccMachine {
  const joined = values.join(" ");
  if (/\bS\s*1\b/i.test(joined)) return "S1";
  if (/\bS\s*2\b/i.test(joined)) return "S2";
  return "COMMON";
}

function statusOf(value: string) {
  const key = normalizeText(value);
  if (key === "dat") return "Đạt";
  if (key === "khong dat") return "Không đạt";
  throw new Error(`Tình trạng không hợp lệ: ${value || "(trống)"}`);
}

async function main() {
  const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const periodArg = process.argv.find((arg) => arg.startsWith("--period="))?.slice("--period=".length);
  const sourcePath = path.resolve(fileArg || DEFAULT_FILE);
  const clock = vietnamClock();
  const periodLabel = periodArg || periodLabelOf(clock.year, clock.month);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File FM200.xlsx không có sheet dữ liệu");

  const headers = REQUIRED_HEADERS.map((_, index) => text(sheet.getCell(1, index + 1).value));
  const missing = REQUIRED_HEADERS.filter((header, index) => normalizeText(headers[index]) !== normalizeText(header));
  if (missing.length) throw new Error(`Sai cấu trúc cột Excel, không khớp: ${missing.join(", ")}`);

  const period = await prisma.pcccPeriod.findUnique({ where: { label: periodLabel } });
  if (!period) throw new Error(`Không tìm thấy kỳ PCCC ${periodLabel}`);
  if (period.isClosed) throw new Error(`Kỳ ${periodLabel} đã chốt, không thể nhập dữ liệu`);

  const rows = [];
  const seen = new Set<string>();
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
    const heThong = text(sheet.getCell(rowNo, 1).value);
    const ma = text(sheet.getCell(rowNo, 2).value);
    const viTri = text(sheet.getCell(rowNo, 3).value);
    const rawPosition = text(sheet.getCell(rowNo, 4).value);
    const rawStatus = text(sheet.getCell(rowNo, 5).value);
    const ghiChu = text(sheet.getCell(rowNo, 6).value);
    if (!heThong && !ma) continue;
    if (!heThong || !ma || !rawPosition || !rawStatus) throw new Error(`Dòng ${rowNo} thiếu trường bắt buộc`);
    if (seen.has(ma)) throw new Error(`Mã thiết bị bị trùng trong Excel: ${ma}`);
    seen.add(ma);

    const inferredMachine = machineOf(rawPosition, viTri, ma);
    const position = normalizePosition(rawPosition, inferredMachine);
    if (position.unmatched || !position.code || !position.label) {
      throw new Error(`Dòng ${rowNo}: cương vị không có trong danh mục website: ${rawPosition}`);
    }
    rows.push({
      stt: rowNo - 1,
      heThong,
      ma,
      viTri: viTri || null,
      cuongVi: position.label,
      cuongViCode: position.code,
      machine: position.machine,
      tinhTrang: statusOf(rawStatus),
      ghiChu: ghiChu || null,
    });
  }
  if (!rows.length) throw new Error("Không có dòng dữ liệu nào trong file Excel");

  await prisma.$transaction(
    rows.map((row) =>
      prisma.pcccFireControlCabinet.upsert({
        where: { periodId_ma: { periodId: period.id, ma: row.ma } },
        create: { ...row, periodId: period.id },
        update: row,
      })
    )
  );

  const byPosition = rows.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.cuongVi} · ${row.machine}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ file: sourcePath, period: periodLabel, imported: rows.length, byPosition }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
