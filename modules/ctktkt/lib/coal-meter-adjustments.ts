export const COAL_ADJUSTMENT_CELLS = { s1: ["W28", "Y28", "AA28"], s2: ["AG28", "AI28", "AK28"] } as const;
export const COAL_METER_ROWS = Array.from({ length: 12 }, (_, index) => 16 + index);
export const COAL_SHIFT_HOURS = ["08h", "16h", "24h"] as const;
export type CoalMeterUnit = keyof typeof COAL_ADJUSTMENT_CELLS;

export function coalFeederCode(row: number) {
  return `${String.fromCharCode(65 + Math.floor((row - 16) / 2))}${(row - 16) % 2 + 1}`;
}

export function coalMeterAdjustmentCell(unit: CoalMeterUnit, row: number, shiftIndex: number) {
  return `COAL_ADJ_${unit.toUpperCase()}_${coalFeederCode(row)}_CA${shiftIndex + 1}`;
}

function adjustmentValue(value: string | undefined) {
  const amount = Number(value?.trim().replace(",", "."));
  return Number.isFinite(amount) ? amount : 0;
}

export function coalMeterAdjustments(entries: Record<string, string>, unit: CoalMeterUnit, row: number) {
  return COAL_SHIFT_HOURS.map((_, index) => adjustmentValue(entries[coalMeterAdjustmentCell(unit, row, index)]));
}

export function coalShiftAdjustments(entries: Record<string, string>, unit: CoalMeterUnit, prefix = "") {
  return COAL_ADJUSTMENT_CELLS[unit].map((legacyCell, index) =>
    COAL_METER_ROWS.reduce((total, row) =>
      total + adjustmentValue(entries[prefix + coalMeterAdjustmentCell(unit, row, index)]),
    adjustmentValue(entries[prefix + legacyCell])),
  );
}
