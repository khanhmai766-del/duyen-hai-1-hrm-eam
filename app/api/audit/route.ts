import { prisma } from "@/lib/prisma";
import { ok, requireUser, requireRole, handle } from "@/lib/api";
import { actionConfig } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    // Retention: purge audit entries older than 3 months. Runs lazily on read
    // (no cron in this deployment) and is non-fatal if it fails.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
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
