import { handle, ok, requireUser } from "@/lib/api";
import { assignedPermissionMap } from "@/lib/rbac-permissions";
import { lookupModulesFor } from "@/lib/server/lookup-access";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok({
      role: user.role,
      permissions: await assignedPermissionMap(user),
      lookupModules: user.accessMode === "DEFECT_READ_ONLY" ? await lookupModulesFor(user.id) : null,
    });
  });
}
