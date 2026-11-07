import type {PpaSourceData} from './ppa-heat-rate';

/** Notes-only rows use {} until actual meter readings are saved. Never invent
 * intervals from daily totals or silently accept a partially populated source. */
export function storedPpaMeterSource(raw: unknown): PpaSourceData | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let value: unknown;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new Error('PPA_METER_SOURCE_INVALID'); }
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('PPA_METER_SOURCE_INVALID');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length === 0) return null;
  for (const key of ['grossS1', 'netS1', 'grossS2', 'netS2']) {
    const values = source[key];
    if (!Array.isArray(values) || values.length !== 48 || values.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) {
      throw new Error('PPA_METER_SOURCE_INVALID');
    }
  }
  return source as PpaSourceData;
}
