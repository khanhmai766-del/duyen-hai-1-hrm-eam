import ExcelJS from "exceljs";
import type { OperatingEvent } from "@/modules/ctktkt/lib/bcsx";

export type OperationUnit = "S1" | "S2";

export type InitialPowerMw = Partial<Record<OperationUnit, number>>;

export type OperationImportResult = {
  kind: "BCSX_OPERATION_IMPORT";
  version: 1;
  operatingDate: string;
  sourceFileName: string;
  sourceRows: number;
  ignoredRows: number;
  initialPowerMw: Record<OperationUnit, number>;
  events: Record<OperationUnit, OperatingEvent[]>;
  allEvents: Array<OperatingEvent & { unit: OperationUnit }>;
};

type SourceCommand = {
  rowNumber: number;
  unit: OperationUnit;
  commandLabel: string;
  eventType: number;
  startAt: string;
  endAt: string;
  startOrder: number;
  endOrder: number;
  completedPowerMw: number;
};

const units = new Set<OperationUnit>(["S1", "S2"]);
const minimumPowerMw = 435.7;
const maximumPowerMw = 622.5;
const requiredHeaders = {
  plant: "nha may",
  unit: "to may",
  command: "noi dung lenh",
  completedPower: "cs hoan thanh (mw)",
  startAt: "thoi diem bdth",
  endAt: "thoi diem hoan thanh",
  completed: "hoan thanh",
} as const;

function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, " ").trim().toLowerCase();
}

function readNumber(value: unknown, location: string) {
  const numberValue = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(numberValue)) throw new Error(location + ": công suất hoàn thành không phải số hợp lệ.");
  return numberValue;
}

function isCompleted(value: unknown) {
  if (value === true || value === 1) return true;
  return ["1", "true", "x", "yes", "co"].includes(normalizeText(value));
}

export function classifyOperationCommand(value: unknown) {
  const command = normalizeText(value);
  if (command === "thay doi cong suat") return 1;
  if (command.includes("ngung su co") || (command.includes("su co") && command.includes("bao ve"))) return 5;
  if (["bat thuong", "qua tai", "dien ap cao", "dien ap thap", "nhiet do cao"].some(term => command.includes(term))) return 4;
  if ((command.includes("tach") && command.includes("sua chua")) || (command.includes("dua") && command.includes("vao du phong"))) return 3;
  if (["dot lo", "khoi dong", "hoa luoi", "ngung to may"].some(term => command.includes(term))) return 2;
  return null;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateToTimestamp(value: Date) {
  return String(value.getUTCFullYear()) + "-" + pad2(value.getUTCMonth() + 1) + "-" + pad2(value.getUTCDate()) + " " + pad2(value.getUTCHours()) + ":" + pad2(value.getUTCMinutes());
}

function readTimestamp(value: unknown, location: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateToTimestamp(value);
  if (typeof value === "number" && Number.isFinite(value)) return dateToTimestamp(new Date(Math.round((value - 25569) * 86400 * 1000)));
  const text = String(value ?? "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (isoMatch) return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3] + " " + isoMatch[4] + ":" + isoMatch[5];
  const vnMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})/);
  if (vnMatch) return vnMatch[3] + "-" + pad2(Number(vnMatch[2])) + "-" + pad2(Number(vnMatch[1])) + " " + pad2(Number(vnMatch[4])) + ":" + vnMatch[5];
  throw new Error(location + ": thời điểm không hợp lệ.");
}

function readTimestampOrder(value: unknown, timestamp: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return Math.round((value - 25569) * 86400 * 1000);
  return Date.UTC(Number(timestamp.slice(0, 4)), Number(timestamp.slice(5, 7)) - 1, Number(timestamp.slice(8, 10)), Number(timestamp.slice(11, 13)), Number(timestamp.slice(14, 16)));
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const headers = new Map<string, number>();
    worksheet.getRow(rowNumber).eachCell((cell, columnNumber) => headers.set(normalizeText(cell.value), columnNumber));
    if (Object.values(requiredHeaders).every(header => headers.has(header))) return { rowNumber, headers };
  }
  throw new Error("Sheet " + worksheet.name + " không có đủ cột bắt buộc của file DanhSachLenhKetThuc.");
}

function findSourceSheet(workbook: ExcelJS.Workbook) {
  const preferred = workbook.getWorksheet("All");
  const candidates = preferred ? [preferred, ...workbook.worksheets.filter(sheet => sheet !== preferred)] : workbook.worksheets;
  for (const worksheet of candidates) {
    try {
      return { worksheet, ...findHeaderRow(worksheet) };
    } catch {
      continue;
    }
  }
  throw new Error("Không tìm thấy sheet chứa danh sách lệnh kết thúc hợp lệ.");
}

function minuteDifference(later: string, earlier: string) {
  const parse = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)), Number(value.slice(11, 13)), Number(value.slice(14, 16)));
  return (parse(later) - parse(earlier)) / 60000;
}

function inferInitialPower(commands: SourceCommand[]) {
  const first = commands[0];
  const second = commands[1];
  if (!first) return minimumPowerMw;
  if (first.completedPowerMw === 0) return minimumPowerMw;
  if (first.completedPowerMw <= minimumPowerMw) return maximumPowerMw;
  if (first.completedPowerMw >= maximumPowerMw) return minimumPowerMw;
  if (second) {
    const gapMinutes = minuteDifference(second.startAt, first.endAt);
    if (gapMinutes >= 0 && gapMinutes <= 60) {
      if (second.completedPowerMw > first.completedPowerMw) return minimumPowerMw;
      if (second.completedPowerMw < first.completedPowerMw) return maximumPowerMw;
    }
  }
  return minimumPowerMw;
}

function resolveInitialPower(commands: SourceCommand[], unit: OperationUnit, unitCommands: SourceCommand[], operatingDate: string, knownInitialPowerMw: InitialPowerMw) {
  const dayStartOrder = Date.UTC(Number(operatingDate.slice(0, 4)), Number(operatingDate.slice(5, 7)) - 1, Number(operatingDate.slice(8, 10)));
  const cutoffOrder = unitCommands[0]?.startOrder ?? dayStartOrder;
  const previousCommand = commands
    .filter(command => command.unit === unit && command.startAt.slice(0, 10) < operatingDate && command.endOrder <= cutoffOrder)
    .sort((left, right) => right.endOrder - left.endOrder || right.startOrder - left.startOrder || right.rowNumber - left.rowNumber)[0];
  const knownPower = knownInitialPowerMw[unit];
  return previousCommand?.completedPowerMw ?? (Number.isFinite(knownPower) ? knownPower as number : inferInitialPower(unitCommands));
}

export function extractCompletedPowerMw(description: unknown) {
  const matches = [...String(description ?? "").matchAll(/(-?\d+(?:[.,]\d+)?)\s*MW\b/gi)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function derivePreviousCompletedPowerMw(rows: Array<{ unit?: unknown; description?: unknown }>): InitialPowerMw {
  const result: InitialPowerMw = {};
  for (const row of rows) {
    const unit = String(row.unit ?? "").toUpperCase() as OperationUnit;
    if (!units.has(unit) || result[unit] !== undefined) continue;
    const completedPowerMw = extractCompletedPowerMw(row.description);
    if (completedPowerMw !== null) result[unit] = completedPowerMw;
  }
  return result;
}

function formatPower(value: number) {
  return String(Number(value.toFixed(3)));
}

function buildDescription(unit: OperationUnit, fromPower: number, toPower: number) {
  if (toPower > fromPower) return "Tăng tải " + unit + " từ " + formatPower(fromPower) + "MW lên " + formatPower(toPower) + "MW";
  if (toPower < fromPower) return "Giảm tải " + unit + " từ " + formatPower(fromPower) + "MW về " + formatPower(toPower) + "MW";
  return "Duy trì tải " + unit + " ở " + formatPower(toPower) + "MW";
}

function resolveEventType(command: SourceCommand, fromPower: number) {
  const durationMs = command.endOrder - command.startOrder;
  const isProtectionTrip = command.eventType === 2
    && command.completedPowerMw === 0
    && fromPower >= minimumPowerMw
    && durationMs >= 0
    && durationMs < 3 * 60 * 1000;
  return isProtectionTrip ? 5 : command.eventType;
}

function buildEventDescription(command: SourceCommand, fromPower: number, eventType: number) {
  if (eventType === 1) return buildDescription(command.unit, fromPower, command.completedPowerMw);
  if (eventType === 5 && command.completedPowerMw === 0) {
    return "Ngừng sự cố tổ máy " + command.unit + " do bảo vệ tác động (trip từ " + formatPower(fromPower) + "MW về 0MW trong thời gian dưới 3 phút)";
  }
  if (eventType === 2 && command.completedPowerMw === 0) {
    return "Ngừng tổ máy " + command.unit + " theo lệnh điều độ (giảm tải từ " + formatPower(fromPower) + "MW về 0MW)";
  }
  const powerDetail = command.completedPowerMw === fromPower
    ? ""
    : " (" + buildDescription(command.unit, fromPower, command.completedPowerMw).toLowerCase() + ")";
  return command.commandLabel + " " + command.unit + powerDetail;
}

export async function parseOperationCommandWorkbook(bytes: ArrayBuffer, sourceFileName: string, expectedDate?: string, knownInitialPowerMw: InitialPowerMw = {}): Promise<OperationImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const { worksheet, rowNumber: headerRowNumber, headers } = findSourceSheet(workbook);
  const column = (key: keyof typeof requiredHeaders) => headers.get(requiredHeaders[key]) as number;
  const commands: SourceCommand[] = [];
  let nonEmptyRows = 0;

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
    if (!rowValues.some(value => value !== null && value !== undefined && String(value).trim() !== "")) continue;
    nonEmptyRows += 1;
    const plant = normalizeText(row.getCell(column("plant")).value);
    const unitValue = String(row.getCell(column("unit")).value ?? "").trim().toUpperCase() as OperationUnit;
    const commandValue = row.getCell(column("command")).value;
    const commandLabel = String(commandValue ?? "").trim();
    const eventType = classifyOperationCommand(commandValue);
    if (!plant.includes("duyen hai 1") || !units.has(unitValue) || eventType === null || !isCompleted(row.getCell(column("completed")).value)) continue;
    const location = worksheet.name + "!" + rowNumber;
    const startValue = row.getCell(column("startAt")).value;
    const startAt = readTimestamp(startValue, location);
    const endValue = row.getCell(column("endAt")).value;
    const endAt = readTimestamp(endValue, location);
    if (endAt < startAt) throw new Error(location + ": thời điểm hoàn thành trước thời điểm bắt đầu.");
    commands.push({ rowNumber, unit: unitValue, commandLabel, eventType, startAt, endAt, startOrder: readTimestampOrder(startValue, startAt), endOrder: readTimestampOrder(endValue, endAt), completedPowerMw: readNumber(row.getCell(column("completedPower")).value, location) });
  }

  if (!commands.length) {
    const dateDetail = expectedDate ? " trong ngày " + expectedDate.split("-").reverse().join("/") : "";
    throw new Error("File không có lệnh thay đổi công suất đã hoàn thành của Duyên Hải 1 cho S1/S2" + dateDetail + ".");
  }
  const operatingDates = new Set(commands.map(command => command.startAt.slice(0, 10)));
  if (!expectedDate && operatingDates.size !== 1) throw new Error("File chứa lệnh của nhiều ngày; hãy chọn ngày cần nhập trước khi thực hiện.");
  const operatingDate = expectedDate || [...operatingDates][0];
  const selectedCommands = commands.filter(command => command.startAt.slice(0, 10) === operatingDate);

  if (!selectedCommands.length) {
    const dateDetail = expectedDate ? " trong ngày " + expectedDate.split("-").reverse().join("/") : "";
    throw new Error("File không có lệnh thay đổi công suất đã hoàn thành của Duyên Hải 1 cho S1/S2" + dateDetail + ".");
  }

  commands.sort((left, right) => left.startOrder - right.startOrder || left.endOrder - right.endOrder || left.rowNumber - right.rowNumber);
  selectedCommands.sort((left, right) => left.startOrder - right.startOrder || left.endOrder - right.endOrder || left.rowNumber - right.rowNumber);
  const initialPowerMw: Record<OperationUnit, number> = { S1: minimumPowerMw, S2: minimumPowerMw };
  const events: Record<OperationUnit, OperatingEvent[]> = { S1: [], S2: [] };
  const eventByRow = new Map<number, OperatingEvent>();
  for (const unit of ["S1", "S2"] as const) {
    const unitCommands = selectedCommands.filter(command => command.unit === unit);
    initialPowerMw[unit] = resolveInitialPower(commands, unit, unitCommands, operatingDate, knownInitialPowerMw);
    let currentPower = initialPowerMw[unit];
    for (const command of unitCommands) {
      const eventType = resolveEventType(command, currentPower);
      const event = { startAt: command.startAt, endAt: command.endAt, eventType, description: buildEventDescription(command, currentPower, eventType) };
      events[unit].push(event);
      eventByRow.set(command.rowNumber, event);
      currentPower = command.completedPowerMw;
    }
  }

  const allEvents = selectedCommands.map(command => ({ ...(eventByRow.get(command.rowNumber) as OperatingEvent), unit: command.unit }));
  return { kind: "BCSX_OPERATION_IMPORT", version: 1, operatingDate, sourceFileName, sourceRows: selectedCommands.length, ignoredRows: Math.max(0, nonEmptyRows - selectedCommands.length), initialPowerMw, events, allEvents };
}

function timeOnlyDate(timestamp: string) {
  return new Date(Date.UTC(1899, 11, 30, Number(timestamp.slice(11, 13)), Number(timestamp.slice(14, 16))));
}

export async function buildQlktOperationWorkbook(result: OperationImportResult): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("DH1 TGVH", { views: [{ activeCell: "B2", zoomScale: 85, zoomScaleNormal: 85 }] });
  worksheet.properties.defaultRowHeight = 21.75;
  worksheet.columns = [
    { header: "BĐ", key: "startAt", width: 7.1328125 },
    { header: "KT", key: "endAt", width: 7.1328125 },
    { header: "Mã SK", key: "eventType", width: 9.1328125 },
    { header: "Sự kiện", key: "description", width: 46.73046875 },
    { header: "TM", key: "plant", width: 9.1328125 },
  ];
  worksheet.getRow(1).height = 16.5;
  worksheet.getRow(1).eachCell(cell => {
    cell.font = { name: "Times New Roman", family: 1, charset: 163, size: 13, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    cell.border = { left: { style: "thin" }, right: { style: "thin" }, top: { style: "thin" }, bottom: { style: "thin" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (const event of result.allEvents) {
    const row = worksheet.addRow({ startAt: timeOnlyDate(event.startAt), endAt: timeOnlyDate(event.endAt), eventType: event.eventType, description: event.description, plant: "DH1" });
    row.eachCell(cell => {
      cell.font = { name: "Times New Roman", family: 1, charset: 163, size: 12 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    row.getCell(1).numFmt = "[$-1000000]h:mm;@";
    row.getCell(2).numFmt = "[$-1000000]h:mm;@";
    row.getCell(3).numFmt = "0";
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function qlktOperationFileName(operatingDate: string) {
  const [year, month, day] = operatingDate.split("-");
  return "DH1_Thoi_gian_VH_" + day + "." + month + "." + year + ".xlsx";
}
