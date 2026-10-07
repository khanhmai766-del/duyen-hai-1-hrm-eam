import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { prisma } from "@/lib/prisma";
import { LOOKUP_ACCESS_MODE, LOOKUP_CONFIG_KEY, isLookupModuleId, lookupModulesForUser, normalizeLookupConfig, type LookupModuleId } from "@/lib/lookup-access";
import { readLookupConfig } from "@/lib/server/lookup-access";

export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "rbac-manage", ["full"]);
    const [config, users] = await Promise.all([
      readLookupConfig(),
      prisma.user.findMany({ where: { accessMode: LOOKUP_ACCESS_MODE },
        select: { id: true, name: true, employeeId: true, email: true, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return ok(users.map(account => ({ ...account, modules: lookupModulesForUser(config, account.id) })));
  });
}
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "rbac-manage", ["full"]);
    const body = await req.json();
    if (!body || typeof body !== "object" || !Array.isArray(body.userIds) || !body.userIds.length || body.userIds.length > 1000 ||
        !body.userIds.every((id: unknown) => typeof id === "string" && id.length > 0 && id.length <= 100) ||
        !Array.isArray(body.modules) || !body.modules.every(isLookupModuleId)) return fail("Danh sách tài khoản hoặc quyền tra cứu không hợp lệ");
    const userIds = [...new Set<string>(body.userIds)];
    const modules = [...new Set<LookupModuleId>((body.modules as unknown[]).filter(isLookupModuleId))];
    const changes = await prisma.$transaction(async tx => {
      // Khoá chung cả trường hợp chưa có dòng cấu hình; chỉ cập nhật các tài khoản được chọn.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${LOOKUP_CONFIG_KEY}))::text`;
      const users = await tx.user.findMany({ where: { id: { in: userIds }, accessMode: LOOKUP_ACCESS_MODE }, select: { id: true } });
      if (users.length !== userIds.length) throw fail("Chỉ được phân quyền cho tài khoản tra cứu", 400);
      const rows = await tx.$queryRawUnsafe<{ value: string }[]>('SELECT value FROM "RbacConfig" WHERE key = $1 LIMIT 1', LOOKUP_CONFIG_KEY);
      const config = rows[0] ? normalizeLookupConfig(JSON.parse(rows[0].value)) : { users: {} };
      const before = Object.fromEntries(userIds.map(id => [id, lookupModulesForUser(config, id)]));
      for (const id of userIds) config.users[id] = modules;
      await tx.$executeRawUnsafe('INSERT INTO "RbacConfig" (key, value, "updatedById", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedById" = EXCLUDED."updatedById", "updatedAt" = CURRENT_TIMESTAMP', LOOKUP_CONFIG_KEY, JSON.stringify(config), user.id);
      return { before, after: Object.fromEntries(userIds.map(id => [id, modules])) };
    });
    await audit(user.id, "UPDATE_LOOKUP_PERMISSIONS", "RbacConfig", LOOKUP_CONFIG_KEY,
      `Cập nhật quyền đọc cho ${userIds.length} tài khoản tra cứu`, { actorName: user.name, beforeData: changes.before, afterData: changes.after, changedFields: userIds });
    return ok({ userIds, modules });
  });
}
