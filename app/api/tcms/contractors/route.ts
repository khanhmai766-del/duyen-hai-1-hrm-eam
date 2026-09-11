import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseContractorInput } from "@/lib/tcms/server/master-data/contractor-service";
import { PostgresContractorRepository } from "@/lib/tcms/server/master-data/postgres-contractor-repository";

function capabilities(context: Awaited<ReturnType<typeof getRequestContext>>) {
  const permissions = permissionsForRoles(context.principal.roles);
  if (!context.principal.active || !permissions.has("contract.read")) throw new Error("ACCESS_DENIED");
  return { canManage:permissions.has("contract.identity.update") };
}

async function GETHandler(request: Request) {
  try {
    const context=await getRequestContext(request); const access=capabilities(context);
    const contractors=await withSecurityTransaction(context,(client)=>new PostgresContractorRepository(client).list(access.canManage,access.canManage));
    return Response.json({contractors,capabilities:access},{headers:{"cache-control":"no-store"}});
  } catch(error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  try {
    const context=await getRequestContext(request); const access=capabilities(context);
    if(!access.canManage) throw new Error("ACCESS_DENIED");
    const input=parseContractorInput(await request.json());
    const contractor=await withSecurityTransaction(context,(client)=>new PostgresContractorRepository(client).create(input,context.principal.userId));
    return Response.json({contractor},{status:201});
  } catch(error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
