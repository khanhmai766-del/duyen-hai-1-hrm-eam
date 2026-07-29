import { prisma } from "@/lib/prisma";
import { normalizeScopeAccess, type PositionSystemScope } from "@/lib/position-system-scopes";

/**
 * Cache in-process bảng PositionSystemScope (~600 dòng, gần như tĩnh).
 *
 * Bảng này bị đọc NHIỀU LẦN trong một request: hasExplicitScopes, buildEquipmentAccessContext,
 * resolveEquipmentTreeAccess, managingPositionsForEquipmentSeq… Trước khi có cache, prod ghi
 * nhận ~29.400 lượt seq_scan trên bảng chỉ 605 dòng — mỗi lượt là một vòng đi–về DB nằm ngay
 * trên đường phục vụ request.
 *
 * Cùng khuôn với lib/equipment-node-cache.ts: TTL + generation (bỏ kết quả đang tải dở nếu bị
 * invalidate giữa chừng) + gộp các request đang bay vào một lần tải.
 */
const TTL_MS = 5 * 60_000;

type CacheEntry = { value: PositionSystemScope[]; expiresAt: number };

let entry: CacheEntry | null = null;
let inFlight: Promise<PositionSystemScope[]> | null = null;
let generation = 0;

async function load(): Promise<PositionSystemScope[]> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; position: string; systemSeq: string; access: string; createdAt: Date }>
  >`SELECT "id", "position", "systemSeq", "access", "createdAt" FROM "PositionSystemScope"`;
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    systemSeq: row.systemSeq,
    access: normalizeScopeAccess(row.access),
    createdAt: row.createdAt.toISOString(),
  }));
}

export function getCachedPositionSystemScopes(): Promise<PositionSystemScope[]> {
  const now = Date.now();
  if (entry && entry.expiresAt > now) return Promise.resolve(entry.value);
  if (inFlight) return inFlight;
  const gen = generation;
  inFlight = load()
    .then((value) => {
      if (gen === generation) entry = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    })
    // Giữ nguyên hành vi cũ: lỗi đọc scope không được làm hỏng cả request (bảng có thể
    // chưa tồn tại ở môi trường chưa migrate) — coi như không cấu hình scope nào.
    .catch(() => [] as PositionSystemScope[])
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Gọi khi admin sửa phân quyền hệ thống để quyền mới có hiệu lực NGAY, không chờ hết TTL. */
export function invalidatePositionScopeCache() {
  generation++;
  entry = null;
  inFlight = null;
}
