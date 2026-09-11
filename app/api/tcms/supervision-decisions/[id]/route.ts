import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { parseSupervisionDecisionInput,parseSupervisionDecisionVersion } from "@/lib/tcms/server/supervision/supervision-decision-service";
import { PostgresSupervisionDecisionRepository } from "@/lib/tcms/server/supervision/postgres-supervision-decision-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";

async function PATCHHandler(request:Request,{params}:{params: {id:string}}) {
  try {
    const context=await getRequestContext(request); const {id}=await params;
    const body=await request.json(); const input=parseSupervisionDecisionInput(body.decision);
    const expectedVersion=parseSupervisionDecisionVersion(body.expectedVersion);
    const decision=await withSecurityTransaction(context,async(client)=>{
      const repository=new PostgresSupervisionDecisionRepository(client); const current=await repository.findById(id);
      if(!current) throw new Error("SUPERVISION_DECISION_NOT_FOUND");
      const currentContract=await new PostgresContractRepository(client).findById(current.contractId);
      if(!currentContract) throw new Error("SUPERVISION_CONTRACT_NOT_FOUND");
      requireContractPermission(context.principal,"contract.assignment.manage",currentContract);
      if(input.contractId!==current.contractId) {
        const target=await new PostgresContractRepository(client).findById(input.contractId);
        if(!target) throw new Error("SUPERVISION_CONTRACT_NOT_FOUND");
        requireContractPermission(context.principal,"contract.assignment.manage",target);
      }
      return repository.update(id,expectedVersion,input,context.principal.userId);
    });
    return Response.json({decision},{headers:{"cache-control":"no-store"}});
  } catch(error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);
