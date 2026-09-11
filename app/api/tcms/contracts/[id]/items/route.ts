import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseContractItemInput, summarizeContractItems } from "@/lib/tcms/server/contracts/contract-item-service";
import { canContractPermission, requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { PostgresContractItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-item-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";

async function GETHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request); const { id } = await params;
    const result = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id);
      if (!contract) return null;
      requireContractPermission(context.principal,"contract.read",contract);
      const items = await new PostgresContractItemRepository(client).list(id);
      return {
        items,
        summary: summarizeContractItems(items),
        capabilities: {
          canUpdateIdentity: canContractPermission(context.principal, "contract.identity.update", contract),
          canUpdateProgress: canContractPermission(context.principal, "contract.progress.update", contract),
        },
      };
    });
    return result ? Response.json(result,{headers:{"cache-control":"no-store"}}) : Response.json({error:"NOT_FOUND"},{status:404});
  } catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request); const { id } = await params; const input = parseContractItemInput(await request.json());
    const item = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id);
      if (!contract) return null;
      requireContractPermission(context.principal,"contract.identity.update",contract);
      return new PostgresContractItemRepository(client).create(id,input,context.principal.userId);
    });
    return item ? Response.json({item},{status:201}) : Response.json({error:"NOT_FOUND"},{status:404});
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
