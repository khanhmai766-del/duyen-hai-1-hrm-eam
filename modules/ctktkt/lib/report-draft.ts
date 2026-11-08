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

/** Days a forgotten local draft is kept before it is discarded. */
export const REPORT_DRAFT_KEEP_DAYS = 14;

/**
 * Remove this account's drafts for operating dates older than `keepDays` before `today` (YYYY-MM-DD).
 * Other accounts' drafts and unrelated keys are never touched. Returns the number removed.
 */
export function pruneReportDrafts(
  storage: Pick<Storage, "length" | "key" | "removeItem">,
  userId: string,
  today: string,
  keepDays = REPORT_DRAFT_KEEP_DAYS,
): number {
  const prefix = `ctktkt:report-draft:v1:${encodeURIComponent(userId)}:`;
  const cutoff = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(cutoff.getTime())) return 0;
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const limit = cutoff.toISOString().slice(0, 10);
  const stale: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < limit) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
  return stale.length;
}
