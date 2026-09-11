import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { parseContractGoodsItemInput } from "@/lib/tcms/server/contracts/contract-goods-item-service";
import { PostgresContractGoodsItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-goods-item-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";

async function GETHandler(request: Request, { params }: { params: { id: string } }) {
  try { const context=await getRequestContext(request); const {id}=await params; const result=await withSecurityTransaction(context,async(client)=>{const contract=await new PostgresContractRepository(client).findById(id); if(!contract)return null; requireContractPermission(context.principal,"contract.read",contract); return new PostgresContractGoodsItemRepository(client).list(id);}); return result ? Response.json({items:result},{headers:{"cache-control":"no-store"}}) : Response.json({error:"NOT_FOUND"},{status:404}); } catch(error) { return apiError(error); }
}
async function POSTHandler(request: Request, { params }: { params: { id: string } }) {
  try { const context=await getRequestContext(request); const {id}=await params; const input=parseContractGoodsItemInput(await request.json()); const item=await withSecurityTransaction(context,async(client)=>{const contract=await new PostgresContractRepository(client).findById(id); if(!contract)return null; requireContractPermission(context.principal,"contract.identity.update",contract); return new PostgresContractGoodsItemRepository(client).create(id,input,context.principal.userId);}); return item ? Response.json({item},{status:201}) : Response.json({error:"NOT_FOUND"},{status:404}); } catch(error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
