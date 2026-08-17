// Cache cho bước "candidates" của GET /api/defects.
//
// Danh sách khiếm khuyết KHÔNG lọc được hết bằng SQL: rào cương vị so khớp theo mã chức
// danh và thứ tự số yêu cầu ("999/2026" phải đứng sau "1000/2026") đều phải làm trong JS.
// Nên mỗi request tải toàn bộ phiếu đang hoạt động về rồi mới lọc — đo trên production
// 17/08/2026: 5.597 phiếu, 2.9 MB, 485 ms, chỉ để hiện 10 dòng.
//
// Vì trạng thái/mức độ/từ khoá/cương vị đều được lọc SAU trong JS, khoá cache chỉ gồm phần
// thật sự đi vào SQL. Nhờ vậy gõ tìm kiếm hay đổi bộ lọc đều dùng lại đúng một lần tải.
//
// TTL ngắn + xoá sạch theo generation mỗi khi có bản ghi khiếm khuyết bị ghi (xem
// `lib/prisma.ts`), nên không có cửa sổ nào người dùng thấy dữ liệu cũ sau khi chính họ sửa.

const DEFECT_LIST_CACHE_TTL_MS = 30_000;
const DEFECT_LIST_CACHE_MAX_ENTRIES = 60;

type CacheEntry<T> = { value: T; expiresAt: number; createdAt: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
let generation = 0;

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function pruneOverflow() {
  while (cache.size > DEFECT_LIST_CACHE_MAX_ENTRIES) {
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

export async function getOrSetDefectListCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  pruneExpired(now);

  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  // Gộp các request trùng khoá đang bay: mở trang lúc cache vừa hết hạn thì chỉ một
  // truy vấn chạm DB, số còn lại chờ chung kết quả.
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const currentGeneration = generation;
  const promise = loader()
    .then((value) => {
      // Bỏ qua nếu có bản ghi bị sửa trong lúc đang tải — thà tải lại còn hơn cache dữ liệu cũ.
      if (currentGeneration === generation) {
        cache.set(key, { value, expiresAt: Date.now() + DEFECT_LIST_CACHE_TTL_MS, createdAt: Date.now() });
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

export function invalidateDefectListCache() {
  generation++;
  cache.clear();
  inFlight.clear();
}

export function defectListCacheStats() {
  pruneExpired();
  return { entries: cache.size, inFlight: inFlight.size, ttlMs: DEFECT_LIST_CACHE_TTL_MS };
}
