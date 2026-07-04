import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { actionConfig } from "@/lib/activity-log";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "system_audit_log:view", ["read", "manage", "full"], "Không đủ quyền xem nhật ký hoạt động");

    // Retention: purge audit entries older than 1 month. Runs lazily on read
    // (no cron in this deployment) and is non-fatal if it fails.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    try {
      await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch {
      // ignore — never block reading the log on a failed cleanup
    }

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    });
    return ok(logs.map((log) => ({ ...log, category: log.category ?? actionConfig(log.action).category })));
  });
}
