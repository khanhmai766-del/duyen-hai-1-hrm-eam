import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { parseContractGoodsItemInput, parseExpectedVersion } from "@/lib/tcms/server/contracts/contract-goods-item-service";
import { PostgresContractGoodsItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-goods-item-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
type Params={params: {id:string;goodsItemId:string}};
async function PATCHHandler(request:Request,{params}:Params) { try { const context=await getRequestContext(request); const {id,goodsItemId}=await params; const body=await request.json() as {item?:unknown;expectedVersion?:unknown}; const input=parseContractGoodsItemInput(body.item); const version=parseExpectedVersion(body.expectedVersion); const item=await withSecurityTransaction(context,async(client)=>{const contract=await new PostgresContractRepository(client).findById(id); if(!contract)return null; requireContractPermission(context.principal,"contract.identity.update",contract); const repo=new PostgresContractGoodsItemRepository(client); if(!await repo.findById(id,goodsItemId))return null; return repo.update(id,goodsItemId,version,input,context.principal.userId);}); return item?Response.json({item}):Response.json({error:"NOT_FOUND"},{status:404}); } catch(error) { return apiError(error); } }
async function DELETEHandler(request:Request,{params}:Params) { try { const context=await getRequestContext(request); const {id,goodsItemId}=await params; const version=parseExpectedVersion((await request.json() as {expectedVersion?:unknown}).expectedVersion); const found=await withSecurityTransaction(context,async(client)=>{const contract=await new PostgresContractRepository(client).findById(id); if(!contract)return false; requireContractPermission(context.principal,"contract.identity.update",contract); const repo=new PostgresContractGoodsItemRepository(client); if(!await repo.findById(id,goodsItemId))return false; await repo.delete(id,goodsItemId,version); return true;}); return found?new Response(null,{status:204}):Response.json({error:"NOT_FOUND"},{status:404}); } catch(error) { return apiError(error); } }

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);

export const DELETE = adaptTcmsRoute(DELETEHandler);
