export type CtktktHistoryReadbackEntry = {
  operatingDate: string;
  cell: string;
  value: string;
};

export type CtktktHistoryReadbackDay = {
  date: string;
  manualEntries: Array<{ cell: string; value: string }>;
};

function numericValue(value: string | undefined) {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.trim().replaceAll(" ", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function ctktktHistoryValuesEqual(actual: string | undefined, expected: string) {
  if (expected.trim() === "") return actual === undefined || actual.trim() === "";
  const actualNumber = numericValue(actual);
  const expectedNumber = numericValue(expected);
  if (actualNumber !== null && expectedNumber !== null) {
    return Math.abs(actualNumber - expectedNumber) <= 1e-9;
  }
  return actual === expected;
}

export function findCtktktHistoryReadbackMismatch(
  days: CtktktHistoryReadbackDay[],
  entries: CtktktHistoryReadbackEntry[],
) {
  const actualByCell = new Map(entries.map(entry => [
    `${entry.operatingDate}|${entry.cell}`,
    entry.value,
  ]));
  for (const day of days) {
    for (const entry of day.manualEntries) {
      const actual = actualByCell.get(`${day.date}|${entry.cell}`);
      if (!ctktktHistoryValuesEqual(actual, entry.value)) {
        return { date: day.date, cell: entry.cell, expected: entry.value, actual };
      }
    }
  }
  return null;
}
