import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { actionConfig } from "@/lib/activity-log";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

    const params = new URL(req.url).searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize")) || 25));
    const q = params.get("q")?.trim();
    const action = params.get("action")?.trim();
    const from = params.get("from");
    const to = params.get("to");
    const createdAt: Prisma.DateTimeFilter = {};
    if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(to);
    const where: Prisma.AuditLogWhereInput = {
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(q ? { OR: [
        { action: { contains: q, mode: "insensitive" } },
        { entity: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { detail: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    };
    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return ok(
      logs.map((log) => ({ ...log, category: log.category ?? actionConfig(log.action).category })),
      { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    );
  });
}
