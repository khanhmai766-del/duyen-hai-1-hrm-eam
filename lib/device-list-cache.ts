const DEVICE_LIST_CACHE_TTL_MS = 60_000;
const DEVICE_LIST_CACHE_MAX_ENTRIES = 100;

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
  while (cache.size > DEVICE_LIST_CACHE_MAX_ENTRIES) {
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

export async function getOrSetDeviceListCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
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
          expiresAt: Date.now() + DEVICE_LIST_CACHE_TTL_MS,
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

export function invalidateDeviceListCache() {
  generation++;
  cache.clear();
  inFlight.clear();
}

export function deviceListCacheStats() {
  pruneExpired();
  return {
    entries: cache.size,
    inFlight: inFlight.size,
    ttlMs: DEVICE_LIST_CACHE_TTL_MS,
    maxEntries: DEVICE_LIST_CACHE_MAX_ENTRIES,
  };
}
