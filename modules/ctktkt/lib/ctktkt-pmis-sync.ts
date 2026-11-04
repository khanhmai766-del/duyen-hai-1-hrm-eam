export const PMIS_PRODUCTION_CELLS = ["J157", "K157", "J158", "K158"] as const;

export const PMIS_02PD_CELLS = [
  "C181", "D181", "E181", "F181", "G181", "H181", "I181", "J181", "K181",
  "L181", "M181", "N181", "O181", "P181", "Q181", "R181", "S181", "T181",
] as const;

const allowedCells = new Set<string>([...PMIS_PRODUCTION_CELLS, ...PMIS_02PD_CELLS]);

export type CtktktPmisSyncEntry = { cell: string; value: string };

export function sanitizeCtktktPmisSyncEntries(entries: unknown): CtktktPmisSyncEntry[] {
  if (!Array.isArray(entries)) return [];
  const sanitized = new Map<string, CtktktPmisSyncEntry>();
  for (const item of entries) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const cell = String(raw.cell || "").trim();
    const value = String(raw.value ?? "").trim();
    if (!allowedCells.has(cell) || value === "") continue;
    sanitized.set(cell, { cell, value });
  }
  return [...sanitized.values()];
}
