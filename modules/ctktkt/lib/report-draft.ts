type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ReportDraftValues = Record<string, string>;

export function reportDraftKey(userId: string, date: string) {
  return `ctktkt:report-draft:v1:${encodeURIComponent(userId)}:${date}`;
}

export function readReportDraft(storage: DraftStorage, key: string): ReportDraftValues {
  const raw = storage.getItem(key);
  if (raw === null) return {};
  const draft: unknown = JSON.parse(raw);
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Bản nháp không hợp lệ.");
  const values = (draft as { values?: unknown }).values;
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Bản nháp không hợp lệ.");
  const entries = Object.entries(values);
  if (entries.length > 400 || entries.some(([cell, value]) => !/^[A-Z][A-Z0-9_]*$/.test(cell) || typeof value !== "string" || value.length > 25_000)) {
    throw new Error("Bản nháp không hợp lệ.");
  }
  return Object.fromEntries(entries) as ReportDraftValues;
}

export function writeReportDraft(storage: DraftStorage, key: string, values: ReportDraftValues) {
  if (Object.keys(values).length === 0) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify({ values }));
}

/** A late save may acknowledge only the exact values submitted, never newer edits. */
export function acknowledgeReportDraft(values: ReportDraftValues, saved: Array<{ cell: string; value: string }>): ReportDraftValues {
  const pending = { ...values };
  for (const entry of saved) if (pending[entry.cell] === entry.value) delete pending[entry.cell];
  return pending;
}

/** Server reads are the baseline; local edits, including zero and deletion, win. */
export function mergeReportDraft(stored: ReportDraftValues, pending: ReportDraftValues) {
  return { ...stored, ...pending };
}
