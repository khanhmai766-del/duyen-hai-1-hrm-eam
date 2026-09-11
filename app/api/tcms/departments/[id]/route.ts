import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { parseDepartmentInput, parseDepartmentVersion } from "@/lib/tcms/server/master-data/department-service";
import { PostgresDepartmentRepository } from "@/lib/tcms/server/master-data/postgres-department-repository";

async function PATCHHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request);
    const permissions = permissionsForRoles(context.principal.roles);
    if (!context.principal.active || !context.canAdminister || !permissions.has("system.configure")) throw new Error("ACCESS_DENIED");
    const body = await request.json(); const { id } = await params;
    const input = parseDepartmentInput(body.department); const expectedVersion = parseDepartmentVersion(body.expectedVersion);
    const department = await withSecurityTransaction(context, (client) => new PostgresDepartmentRepository(client).update(id, expectedVersion, input));
    return Response.json({ department });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);
