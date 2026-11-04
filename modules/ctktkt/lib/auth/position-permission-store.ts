import { prisma } from "@/lib/prisma";
import { defaultPositionGrants, validatePositionGrants, type PositionPermissionConfig, type PositionGrants } from "./position-permissions";

export const CTKTKT_POSITION_CONFIG_KEY = "ctktkt-position-permissions";
export class PositionPermissionConflict extends Error {
  constructor() { super("Phân quyền đã được người khác thay đổi. Hãy tải lại cấu hình trước khi lưu."); }
}

export async function readPositionPermissionConfig(db = prisma) {
  const rows = await db.$queryRawUnsafe<{ value: string; updatedAt: Date }[]>(
    'SELECT value, "updatedAt" FROM "RbacConfig" WHERE key = $1 LIMIT 1', CTKTKT_POSITION_CONFIG_KEY,
  );
  const row = rows[0];
  if (!row) return { raw: null, config: { schemaVersion: 1, version: 0, grants: defaultPositionGrants() } as PositionPermissionConfig, updatedAt: null };
  try {
    const parsed = JSON.parse(row.value);
    if (parsed.schemaVersion !== 1 || !Number.isSafeInteger(parsed.version) || parsed.version < 1) throw new Error();
    return { raw: row.value, config: { schemaVersion: 1, version: parsed.version, grants: validatePositionGrants(parsed.grants) } as PositionPermissionConfig, updatedAt: row.updatedAt };
  } catch { throw new Error("Cấu hình phân quyền KTKT không hợp lệ. Chưa áp dụng quyền nhập liệu."); }
}

/** Compare-and-swap trên giá trị cũ: hai người cùng mở không ghi đè cấu hình nhau. */
export async function savePositionPermissionConfig(grants: PositionGrants, expectedVersion: number, actorId: string, db = prisma) {
  const before = await readPositionPermissionConfig(db);
  if (before.config.version !== expectedVersion) throw new PositionPermissionConflict();
  const config: PositionPermissionConfig = { schemaVersion: 1, version: expectedVersion + 1, grants: validatePositionGrants(grants) };
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(`
    INSERT INTO "RbacConfig" (key, value, "updatedById", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedById" = EXCLUDED."updatedById", "updatedAt" = CURRENT_TIMESTAMP
    WHERE "RbacConfig".value = $4
    RETURNING value
  `, CTKTKT_POSITION_CONFIG_KEY, JSON.stringify(config), actorId, before.raw);
  if (!rows.length) throw new PositionPermissionConflict();
  return { before: before.config, config };
}
