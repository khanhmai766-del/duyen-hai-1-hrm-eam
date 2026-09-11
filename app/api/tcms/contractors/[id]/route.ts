import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseContractorInput,parseContractorVersion } from "@/lib/tcms/server/master-data/contractor-service";
import { PostgresContractorRepository } from "@/lib/tcms/server/master-data/postgres-contractor-repository";

async function PATCHHandler(request:Request,{params}:{params: {id:string}}) {
  try {
    const context=await getRequestContext(request); const permissions=permissionsForRoles(context.principal.roles);
    if(!context.principal.active||!permissions.has("contract.identity.update")) throw new Error("ACCESS_DENIED");
    const body=await request.json(); const {id}=await params;
    const input=parseContractorInput(body.contractor); const expectedVersion=parseContractorVersion(body.expectedVersion);
    const contractor=await withSecurityTransaction(context,(client)=>new PostgresContractorRepository(client).update(id,expectedVersion,input,context.principal.userId));
    return Response.json({contractor});
  } catch(error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);
