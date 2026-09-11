import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { parseSupervisionDecisionInput } from "@/lib/tcms/server/supervision/supervision-decision-service";
import { PostgresSupervisionDecisionRepository } from "@/lib/tcms/server/supervision/postgres-supervision-decision-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { requireContractPermission,requireRolePermission } from "@/lib/tcms/server/contracts/contract-api";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";

async function GETHandler(request: Request) {
  try {
    const context=await getRequestContext(request); requireRolePermission(context.principal,"contract.read");
    const canManage=permissionsForRoles(context.principal.roles).has("contract.assignment.manage");
    const result=await withSecurityTransaction(context,async(client)=>{
      const repository=new PostgresSupervisionDecisionRepository(client);
      return {decisions:await repository.list(),options:canManage?await repository.options():{contracts:[],personnel:[],workScopes:[]}};
    });
    return Response.json({...result,capabilities:{canManage}},{headers:{"cache-control":"no-store"}});
  } catch(error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  try {
    const context=await getRequestContext(request); const input=parseSupervisionDecisionInput(await request.json());
    const decision=await withSecurityTransaction(context,async(client)=>{
      const contract=await new PostgresContractRepository(client).findById(input.contractId);
      if(!contract) throw new Error("SUPERVISION_CONTRACT_NOT_FOUND");
      requireContractPermission(context.principal,"contract.assignment.manage",contract);
      return new PostgresSupervisionDecisionRepository(client).create(input,context.principal.userId);
    });
    return Response.json({decision},{status:201,headers:{"cache-control":"no-store"}});
  } catch(error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
