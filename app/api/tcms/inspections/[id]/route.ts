import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import {requireContractPermission} from "@/lib/tcms/server/contracts/contract-api";
import {PostgresContractRepository} from "@/lib/tcms/server/contracts/postgres-contract-repository";
import {withSecurityTransaction} from "@/lib/tcms/server/db/security-transaction";
import {apiError} from "@/lib/tcms/server/http/api-response";
import {getRequestContext} from "@/lib/tcms/server/http/request-context";
import {parseInspectionInput,parseInspectionVersion} from "@/lib/tcms/server/inspections/inspection-service";
import {PostgresInspectionRepository} from "@/lib/tcms/server/inspections/postgres-inspection-repository";

async function PATCHHandler(request:Request,{params}:{params: {id:string}}){try{const context=await getRequestContext(request);const {id}=await params;const body=await request.json();const input=parseInspectionInput(body.inspection);const version=parseInspectionVersion(body.expectedVersion);const inspection=await withSecurityTransaction(context,async(client)=>{const repository=new PostgresInspectionRepository(client);const current=await repository.findById(id);if(!current)throw new Error("INSPECTION_NOT_FOUND");const contract=await new PostgresContractRepository(client).findById(current.contractId);if(!contract)throw new Error("INSPECTION_CONTRACT_NOT_FOUND");requireContractPermission(context.principal,"contract.acceptance.update",contract);if(input.contractId!==current.contractId)throw new Error("INSPECTION_CONTRACT_IMMUTABLE");return repository.update(id,version,input,context.principal.userId);});return Response.json({inspection},{headers:{"cache-control":"no-store"}});}catch(error){return apiError(error);}}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);
