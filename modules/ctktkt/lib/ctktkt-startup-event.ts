import type ExcelJS from "exceljs";
import { calculateOilEventSummary, type CtktktDayEntries } from "./ctktkt-report";
import {
  CTKTKT_OIL_EVENT_CONFIG,
  isCtktktOilEventCode,
} from "./ctktkt-oil-event";

function ktktEntries(row: Record<string, string>): CtktktDayEntries {
  const entries: CtktktDayEntries = {};
  for (const [code, value] of Object.entries(row)) {
    if (code.startsWith("KTKT:")) entries[code.slice(5)] = value;
  }
  return entries;
}

function numeric(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function display(value: number | null) {
  return value === null ? "chưa đủ chỉ số" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value)} tấn`;
}

export function applyCtktktStartupEventMetadata(
  sheet: ExcelJS.Worksheet,
  row: Record<string, string>,
) {
  const unit = ["S1", "S2"].includes(row["KTKT:STARTUP_UNIT"])
    ? row["KTKT:STARTUP_UNIT"]
    : "";
  const eventCode = row["KTKT:STARTUP_EVENT"] || "";
  if (unit) {
    sheet.getCell("B87").value = `Công tơ dầu cấp lò ${unit}`;
    sheet.getCell("B88").value = `Công tơ dầu về lò ${unit}`;
  }
  if (!isCtktktOilEventCode(eventCode)) return;
  const event = CTKTKT_OIL_EVENT_CONFIG[eventCode];
  sheet.getCell("B86").value = `CÔNG TƠ DẦU CỦA LÒ${unit ? ` - ${unit}` : ""} - ${event.label.toUpperCase()}`;

  const entries = ktktEntries(row);
  const summary = calculateOilEventSummary(entries, eventCode);
  const minLoadMw = row["KTKT:STARTUP_MIN_LOAD_MW"]?.trim();

  for (const column of ["C", "D", "E", "F", "G", "H"]) {
    for (const rowNumber of [86, 87, 88, 89]) {
      sheet.getCell(`${column}${rowNumber}`).value = null;
    }
  }

  const milestoneDescriptions: string[] = [];
  event.columns.forEach((item, index) => {
    const time = row[`KTKT:${item.timeCell}`]?.trim() || "chưa nhập giờ";
    const minLoad = eventCode === "startup" && index === event.columns.length - 1 && minLoadMw
      ? ` - tải min ${minLoadMw} MW`
      : "";
    const headerCell = sheet.getCell(`${item.column}86`);
    headerCell.value = `${item.label}${minLoad}\n${time}`;
    headerCell.alignment = { ...headerCell.alignment, wrapText: true };
    sheet.getCell(`${item.column}87`).value = numeric(row[`KTKT:${item.column}87`]);
    sheet.getCell(`${item.column}88`).value = numeric(row[`KTKT:${item.column}88`]);
    milestoneDescriptions.push(`${item.label.toLowerCase()} ${time}${minLoad}`);
    if (index > 0) {
      sheet.getCell(`${item.column}89`).value = summary.phaseTonnes[index - 1];
    }
  });

  sheet.getCell("H86").value = "Tổng dầu sự kiện";
  sheet.getCell("H86").alignment = { ...sheet.getCell("H86").alignment, wrapText: true };
  sheet.getCell("B89").value = "Lượng dầu từng giai đoạn / tổng (tấn)";
  sheet.getCell("H89").value = summary.totalTonnes;
  // The source workbook enters the event oil as the unit's boiler oil of the day (E6 for S1, H6 for S2).
  const oilCell = unit === "S1" ? "E6" : unit === "S2" ? "H6" : null;
  if (oilCell && summary.totalTonnes !== null && numeric(row[`KTKT:${oilCell}`]) === null) {
    sheet.getCell(oilCell).value = summary.totalTonnes;
  }
  if (!sheet.getCell("B90").isMerged) sheet.mergeCells("B90:H90");
  const phaseDescriptions = event.phaseLabels.map((label, index) =>
    `${label}: ${display(summary.phaseTonnes[index])}`,
  );
  sheet.getCell("B90").value = `${unit || "Chưa chọn tổ máy"} - ${event.label}: ${milestoneDescriptions.join(" → ")}; ${phaseDescriptions.join("; ")}; tổng: ${display(summary.totalTonnes)}.`;
  sheet.getCell("B90").alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  sheet.getRow(90).height = 30;
}
