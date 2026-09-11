import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import {permissionsForRoles} from "@/lib/tcms/lib/security/authorization";
import {requireContractPermission,requireRolePermission} from "@/lib/tcms/server/contracts/contract-api";
import {PostgresContractRepository} from "@/lib/tcms/server/contracts/postgres-contract-repository";
import {withSecurityTransaction} from "@/lib/tcms/server/db/security-transaction";
import {apiError} from "@/lib/tcms/server/http/api-response";
import {getRequestContext} from "@/lib/tcms/server/http/request-context";
import {parseMilestoneInput} from "@/lib/tcms/server/milestones/milestone-service";
import {PostgresMilestoneRepository} from "@/lib/tcms/server/milestones/postgres-milestone-repository";

async function GETHandler(request:Request){try{const context=await getRequestContext(request);requireRolePermission(context.principal,"contract.read");const canManage=permissionsForRoles(context.principal.roles).has("contract.progress.update");const result=await withSecurityTransaction(context,async(client)=>{const repository=new PostgresMilestoneRepository(client);return {milestones:await repository.list(),summary:await repository.summary(),options:canManage?await repository.options():{contracts:[],workScopes:[],contractItems:[],personnel:[]}};});return Response.json({...result,capabilities:{canManage}},{headers:{"cache-control":"no-store"}});}catch(error){return apiError(error);}}

async function POSTHandler(request:Request){try{const context=await getRequestContext(request);const input=parseMilestoneInput(await request.json());const milestone=await withSecurityTransaction(context,async(client)=>{const contract=await new PostgresContractRepository(client).findById(input.contractId);if(!contract)throw new Error("MILESTONE_CONTRACT_NOT_FOUND");requireContractPermission(context.principal,"contract.progress.update",contract);return new PostgresMilestoneRepository(client).create(input,context.principal.userId);});return Response.json({milestone},{status:201,headers:{"cache-control":"no-store"}});}catch(error){return apiError(error);}}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
