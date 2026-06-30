import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { hasAssignedPermission } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

const VIEW_SYSTEM_AUDIT_PERMISSION = "system_audit_log:view";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!(await hasAssignedPermission(user, VIEW_SYSTEM_AUDIT_PERMISSION))) {
      return fail("Không đủ quyền xem Audit hệ thống", 403);
    }

    const logs = await prisma.systemAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(logs);
  });
}
