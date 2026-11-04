export type CtktktBcsxReading = {
  operatingDate?: string;
  unit: string;
  timeSlot: string;
  metric: string;
  value: string;
};

export type CtktktBcsxWarning = {
  cell: string;
  message: string;
};

const sampleTimes = [
  { column: "M", timeSlot: "06:00", display: "6" },
  { column: "N", timeSlot: "10:00", display: "10" },
  { column: "O", timeSlot: "14:00", display: "14" },
  { column: "P", timeSlot: "18:00", display: "18" },
  { column: "Q", timeSlot: "22:00", display: "22" },
  { column: "R", timeSlot: "23:59", display: "24" },
] as const;

const directRows = [
  { row: 3, unit: "S1", metric: "P", label: "P S1 (MW)" },
  { row: 4, unit: "S1", metric: "Q", label: "Q S1 (MVAr)" },
  { row: 5, unit: "S2", metric: "P", label: "P S2 (MW)" },
  { row: 6, unit: "S2", metric: "Q", label: "Q S2 (MVAr)" },
  { row: 7, unit: "S1", metric: "D", label: "P MBT T1 (MW)" },
  { row: 8, unit: "S2", metric: "D", label: "P MBT T2 (MW)" },
] as const;

const directLinks = directRows.flatMap(row => sampleTimes.map(time => ({
  cell: `${time.column}${row.row}`,
  section: "power_meters" as const,
  sectionLabel: "Công suất và công tơ chính",
  label: `${row.label} · ${time.display}`,
  unit: row.unit,
  metric: row.metric,
  timeSlot: time.timeSlot,
})));

const voltageLinks = sampleTimes.map(time => ({
  cell: `${time.column}20`,
  section: "power_meters" as const,
  sectionLabel: "Công suất và công tơ chính",
  label: `Utc 220kV · ${time.display}`,
  unit: "S1",
  metric: "E",
  timeSlot: time.timeSlot,
}));

export const CTKTKT_BCSX_LINKS = [...directLinks, ...voltageLinks];
export const BCSX_COAL_STOCK_24H_CODE = "BCSX_COAL_STOCK_24H";
export const CTKTKT_COAL_STOCK_24H_CELL = "COAL_STOCK_24H_START";
export const CTKTKT_BCSX_LINKED_CELLS = new Set<string>([
  ...CTKTKT_BCSX_LINKS.map(link => link.cell),
  CTKTKT_COAL_STOCK_24H_CELL,
]);

function readingKey(unit: string, timeSlot: string, metric: string) {
  return `${unit}|${timeSlot}|${metric}`;
}

function validNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? { text: value.trim().replace(",", ".") } : null;
}

export function deriveCtktktCellsFromBcsx(readings: CtktktBcsxReading[]) {
  const byKey = new Map(readings.map(reading => [readingKey(reading.unit, reading.timeSlot, reading.metric), reading.value]));
  const entries: Record<string, string> = {};
  const warnings: CtktktBcsxWarning[] = [];

  for (const link of directLinks) {
    const value = validNumber(byKey.get(readingKey(link.unit, link.timeSlot, link.metric)));
    if (value) entries[link.cell] = value.text;
  }

  for (const link of voltageLinks) {
    const s1 = validNumber(byKey.get(readingKey("S1", link.timeSlot, "E")));
    if (s1) entries[link.cell] = s1.text;
  }

  return { entries, warnings };
}
