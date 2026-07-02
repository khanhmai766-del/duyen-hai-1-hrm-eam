const USER_SUMMARY_CACHE_TTL_MS = 60_000;

type UserSummaryCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

let summaryCache: UserSummaryCacheEntry<unknown> | null = null;
let summaryInFlight: Promise<unknown> | null = null;

export async function getOrSetUserSummaryCache<T>(loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (summaryCache && summaryCache.expiresAt > now) return summaryCache.value as T;
  if (summaryInFlight) return summaryInFlight as Promise<T>;

  summaryInFlight = loader()
    .then((value) => {
      summaryCache = {
        value,
        expiresAt: Date.now() + USER_SUMMARY_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      summaryInFlight = null;
    });

  return summaryInFlight as Promise<T>;
}

export function invalidateUserSummaryCache() {
  summaryCache = null;
  summaryInFlight = null;
}
