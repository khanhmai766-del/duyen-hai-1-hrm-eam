import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { hasAssignedPermission } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

const VIEW_SYSTEM_AUDIT_PERMISSION = "system_audit_log:view";
const SYSTEM_AUDIT_RETENTION_YEARS = 2;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastCleanupAt = 0;

async function purgeExpiredSystemAuditLogs() {
  if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - SYSTEM_AUDIT_RETENTION_YEARS);
  try {
    await prisma.systemAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    lastCleanupAt = Date.now();
  } catch (error) {
    // Việc dọn dữ liệu không được làm gián đoạn chức năng tra cứu.
    console.warn("Không thể dọn Audit hệ thống quá hạn", error);
  }
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await hasAssignedPermission(user, VIEW_SYSTEM_AUDIT_PERMISSION))) {
      return fail("Không đủ quyền xem Audit hệ thống", 403);
    }
    await purgeExpiredSystemAuditLogs();

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
    const where: Prisma.SystemAuditLogWhereInput = {
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(q ? { OR: [
        { actorName: { contains: q, mode: "insensitive" } },
        { actorUserId: { contains: q, mode: "insensitive" } },
        { targetType: { contains: q, mode: "insensitive" } },
        { targetId: { contains: q, mode: "insensitive" } },
        { ipAddress: { contains: q, mode: "insensitive" } },
      ] } : {}),
    };
    const [logs, total] = await prisma.$transaction([
      prisma.systemAuditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.systemAuditLog.count({ where }),
    ]);
    return ok(logs, { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  });
}
