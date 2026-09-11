import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { parseDepartmentInput } from "@/lib/tcms/server/master-data/department-service";
import { PostgresDepartmentRepository } from "@/lib/tcms/server/master-data/postgres-department-repository";

function capabilities(context: Awaited<ReturnType<typeof getRequestContext>>) {
  const permissions = permissionsForRoles(context.principal.roles);
  if (!context.principal.active || (!permissions.has("contract.read") && !permissions.has("system.configure") && !permissions.has("user.manage"))) throw new Error("ACCESS_DENIED");
  return { canManage: permissions.has("system.configure") && context.canAdminister };
}

async function GETHandler(request: Request) {
  try {
    const context = await getRequestContext(request); const access = capabilities(context);
    const departments = await withSecurityTransaction(context, (client) => new PostgresDepartmentRepository(client).list(access.canManage));
    return Response.json({ departments, capabilities: access }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  try {
    const context = await getRequestContext(request); const access = capabilities(context);
    if (!access.canManage) throw new Error("ACCESS_DENIED");
    const input = parseDepartmentInput(await request.json());
    const department = await withSecurityTransaction(context, (client) => new PostgresDepartmentRepository(client).create(input));
    return Response.json({ department }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
