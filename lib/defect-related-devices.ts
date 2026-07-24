export const MAX_DEFECT_RELATED_DEVICES = 20;

export function normalizeRelatedDeviceSeqs(value: unknown, primaryDeviceSeq?: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const primary = String(primaryDeviceSeq ?? "").trim();
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") return null;
    const seq = item.trim();
    if (!seq || seq === primary || seen.has(seq)) continue;
    seen.add(seq);
    result.push(seq);
    if (result.length > MAX_DEFECT_RELATED_DEVICES) return null;
  }

  return result;
}
