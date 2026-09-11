import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import {requireContractPermission} from "@/lib/tcms/server/contracts/contract-api";
import {PostgresContractRepository} from "@/lib/tcms/server/contracts/postgres-contract-repository";
import {withSecurityTransaction} from "@/lib/tcms/server/db/security-transaction";
import {apiError} from "@/lib/tcms/server/http/api-response";
import {getRequestContext} from "@/lib/tcms/server/http/request-context";
import {parseMilestoneInput,parseMilestoneVersion} from "@/lib/tcms/server/milestones/milestone-service";
import {PostgresMilestoneRepository} from "@/lib/tcms/server/milestones/postgres-milestone-repository";

async function PATCHHandler(request:Request,{params}:{params: {id:string}}){try{const context=await getRequestContext(request);const {id}=await params;const body=await request.json();const input=parseMilestoneInput(body.milestone);const expectedVersion=parseMilestoneVersion(body.expectedVersion);const milestone=await withSecurityTransaction(context,async(client)=>{const repository=new PostgresMilestoneRepository(client);const current=await repository.findById(id);if(!current)throw new Error("MILESTONE_NOT_FOUND");const currentContract=await new PostgresContractRepository(client).findById(current.contractId);if(!currentContract)throw new Error("MILESTONE_CONTRACT_NOT_FOUND");requireContractPermission(context.principal,"contract.progress.update",currentContract);if(input.contractId!==current.contractId){const target=await new PostgresContractRepository(client).findById(input.contractId);if(!target)throw new Error("MILESTONE_CONTRACT_NOT_FOUND");requireContractPermission(context.principal,"contract.progress.update",target);}return repository.update(id,expectedVersion,input,context.principal.userId);});return Response.json({milestone},{headers:{"cache-control":"no-store"}});}catch(error){return apiError(error);}}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);
