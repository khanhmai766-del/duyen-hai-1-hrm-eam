import { prisma } from "@/lib/prisma";
import { LOOKUP_CONFIG_KEY, lookupModulesForUser, normalizeLookupConfig, type LookupConfig } from "@/lib/lookup-access";

// Phân quyền riêng; không dùng vai trò/override RBAC để nâng quyền ghi của tài khoản tra cứu.
export async function readLookupConfig(): Promise<LookupConfig> {
  const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
    'SELECT value FROM "RbacConfig" WHERE key = $1 LIMIT 1', LOOKUP_CONFIG_KEY);
  if (!rows[0]) return { users: {} };
  try { return normalizeLookupConfig(JSON.parse(rows[0].value)); }
  catch { throw new Error("Cấu hình phân quyền tra cứu không hợp lệ"); }
}
export async function lookupModulesFor(userId: string) {
  return lookupModulesForUser(await readLookupConfig(), userId);
}
