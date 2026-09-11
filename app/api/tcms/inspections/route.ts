import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import {permissionsForRoles} from "@/lib/tcms/lib/security/authorization";
import {requireContractPermission,requireRolePermission} from "@/lib/tcms/server/contracts/contract-api";
import {PostgresContractRepository} from "@/lib/tcms/server/contracts/postgres-contract-repository";
import {withSecurityTransaction} from "@/lib/tcms/server/db/security-transaction";
import {apiError} from "@/lib/tcms/server/http/api-response";
import {getRequestContext} from "@/lib/tcms/server/http/request-context";
import {parseInspectionInput} from "@/lib/tcms/server/inspections/inspection-service";
import {PostgresInspectionRepository} from "@/lib/tcms/server/inspections/postgres-inspection-repository";

async function GETHandler(request:Request){try{const context=await getRequestContext(request);requireRolePermission(context.principal,"contract.read");const canManage=permissionsForRoles(context.principal.roles).has("contract.acceptance.update");const result=await withSecurityTransaction(context,async(client)=>{const repository=new PostgresInspectionRepository(client);return {inspections:await repository.list(),summary:await repository.summary(),options:await repository.options(canManage)};});return Response.json({...result,capabilities:{canManage}},{headers:{"cache-control":"no-store"}});}catch(error){return apiError(error);}}
async function POSTHandler(request:Request){try{const context=await getRequestContext(request);const input=parseInspectionInput(await request.json());const inspection=await withSecurityTransaction(context,async(client)=>{const contract=await new PostgresContractRepository(client).findById(input.contractId);if(!contract)throw new Error("INSPECTION_CONTRACT_NOT_FOUND");requireContractPermission(context.principal,"contract.acceptance.update",contract);return new PostgresInspectionRepository(client).create(input,context.principal.userId);});return Response.json({inspection},{status:201,headers:{"cache-control":"no-store"}});}catch(error){return apiError(error);}}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
