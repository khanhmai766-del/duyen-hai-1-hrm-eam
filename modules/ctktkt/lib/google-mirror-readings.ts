type ShiftRow = Record<string, unknown>;
const key = (date: string, unit: string, time: string, metric: string) => JSON.stringify([date, unit, time, metric]);

/** Match Array.find exactly, including first-row wins for duplicate readings. */
export function indexMirrorReadings(rows: ShiftRow[]) {
  const index = new Map<string, ShiftRow>();
  for (const row of rows) {
    const id = key(String(row.operating_date), String(row.unit), String(row.time_slot), String(row.metric));
    if (!index.has(id)) index.set(id, row);
  }
  return (date: string, unit: string, time: string, metric: string) => index.get(key(date, unit, time, metric));
}
