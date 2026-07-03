import { handle, ok, requireUser } from "@/lib/api";
import { assignedPermissionMap } from "@/lib/rbac-permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok({
      role: user.role,
      permissions: await assignedPermissionMap(user),
    });
  });
}
