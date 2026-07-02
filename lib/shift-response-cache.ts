const SHIFT_DETAIL_CACHE_TTL_MS = 15_000;
const SHIFT_LIST_CACHE_TTL_MS = 60_000;
const SHIFT_CACHE_MAX_ENTRIES = 80;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
let generation = 0;

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function pruneOverflow() {
  while (cache.size > SHIFT_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of cache) {
      if (entry.createdAt < oldestCreatedAt) {
        oldestCreatedAt = entry.createdAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export function shiftDetailCacheKey(params: { date: string; shiftType?: string | null; unit?: string | null }) {
  return `shift-detail:${params.date}:${params.shiftType ?? ""}:${params.unit ?? ""}`;
}

export async function getOrSetShiftCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  pruneExpired(now);

  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const currentGeneration = generation;
  const promise = loader()
    .then((value) => {
      if (currentGeneration === generation) {
        cache.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
          createdAt: Date.now(),
        });
        pruneOverflow();
      }
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export function getOrSetShiftDetailCache<T>(key: string, loader: () => Promise<T>) {
  return getOrSetShiftCache(key, SHIFT_DETAIL_CACHE_TTL_MS, loader);
}

export function getOrSetShiftListCache<T>(loader: () => Promise<T>) {
  return getOrSetShiftCache("shift-list", SHIFT_LIST_CACHE_TTL_MS, loader);
}

export function invalidateShiftCache() {
  generation++;
  cache.clear();
  inFlight.clear();
}

export function shiftCacheStats() {
  pruneExpired();
  return {
    entries: cache.size,
    inFlight: inFlight.size,
    detailTtlMs: SHIFT_DETAIL_CACHE_TTL_MS,
    listTtlMs: SHIFT_LIST_CACHE_TTL_MS,
    maxEntries: SHIFT_CACHE_MAX_ENTRIES,
  };
}
