import type ExcelJS from "exceljs";

/**
 * Hiệu chỉnh công tơ điện khi công tơ bị reset/thay (MWh).
 * Lượng điện trong ngày = số cuối ngày − số cuối ngày D-1 + hiệu chỉnh,
 * giống cách file Excel cộng bù trực tiếp vào công thức (vd. =D21-C21+6935855.62+280.956).
 * Hiệu chỉnh thường = số công tơ ngay trước khi reset − số mốc trước đó cộng phần điện đã đi qua.
 */
type Unit = "S1" | "S2";
type MeterRow = 8 | 9 | 10 | 11;

const SECTION = "power_meters";
const SECTION_LABEL = "Hiệu chỉnh công tơ điện khi reset";
const METER_LABELS: Record<Unit, Record<MeterRow, string>> = {
  S1: { 8: "Công tơ máy phát S1", 9: "Công tơ MBT T1", 10: "Công tơ tự dùng TD 911", 11: "Công tơ tự dùng TD 912" },
  S2: { 8: "Công tơ máy phát S2", 9: "Công tơ MBT T2", 10: "Công tơ tự dùng TD 921", 11: "Công tơ tự dùng TD 922" },
};
const METER_ROWS: readonly MeterRow[] = [8, 9, 10, 11];
/** Hàng công tơ (8–11) → hàng lượng điện trong ngày trên sheet ngày (20–23). */
const WORKBOOK_ROW: Record<MeterRow, number> = { 8: 20, 9: 21, 10: 22, 11: 23 };

export function electricMeterResetCell(unit: Unit, row: MeterRow) {
  return `ELEC_RESET_${unit}_${row}`;
}
export function electricMeterResetNoteCell(unit: Unit) {
  return `ELEC_RESET_NOTE_${unit}`;
}

export const CTKTKT_ELECTRIC_METER_RESET_FIELDS = (["S1", "S2"] as const).flatMap(unit =>
  METER_ROWS.map(row => ({
    cell: electricMeterResetCell(unit, row),
    section: SECTION,
    sectionLabel: SECTION_LABEL,
    label: `${METER_LABELS[unit][row]} · Hiệu chỉnh khi reset (MWh)`,
    row: 0,
    column: 0,
  })),
);

export const CTKTKT_ELECTRIC_METER_RESET_NOTE_FIELDS = (["S1", "S2"] as const).map(unit => ({
  cell: electricMeterResetNoteCell(unit),
  section: SECTION,
  sectionLabel: SECTION_LABEL,
  label: `Lý do hiệu chỉnh công tơ điện ${unit}`,
  row: 0,
  column: 0,
}));

export const CTKTKT_ELECTRIC_METER_RESET_CELLS = new Set<string>([
  ...CTKTKT_ELECTRIC_METER_RESET_FIELDS.map(field => field.cell),
  ...CTKTKT_ELECTRIC_METER_RESET_NOTE_FIELDS.map(field => field.cell),
]);

function numeric(value: string | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!text) return 0;
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

/** Hiệu chỉnh của một công tơ trong ngày; ô trống = 0. `entries` dùng mã ô không có tiền tố KTKT:. */
export function electricMeterResetAdjustment(entries: Readonly<Record<string, string>> | undefined, unit: Unit, row: MeterRow) {
  return numeric(entries?.[electricMeterResetCell(unit, row)]);
}

/** Cộng hiệu chỉnh vào công thức lượng điện trong ngày (E20–E23 / H20–H23). `row` dùng mã KTKT:. */
export function applyElectricMeterResetExport(sheet: ExcelJS.Worksheet, row: Record<string, string>) {
  for (const unit of ["S1", "S2"] as const) {
    const [result, current, previous] = unit === "S1" ? ["E", "D", "C"] : ["H", "G", "F"];
    const note = row[`KTKT:${electricMeterResetNoteCell(unit)}`]?.trim();
    for (const meterRow of METER_ROWS) {
      const adjustment = numeric(row[`KTKT:${electricMeterResetCell(unit, meterRow)}`]);
      if (adjustment === 0) continue;
      const target = WORKBOOK_ROW[meterRow];
      const cell = sheet.getCell(`${result}${target}`);
      cell.value = { formula: `${current}${target}-${previous}${target}+(${adjustment})` };
      cell.note = `Hiệu chỉnh công tơ khi reset: ${adjustment} MWh${note ? `. Lý do: ${note}` : ""}`;
    }
  }
}
