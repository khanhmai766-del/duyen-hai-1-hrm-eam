import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { canContractPermission, requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { PostgresContractItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-item-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";

async function GETHandler(request: Request, { params }: { params: { id: string; itemId: string } }) {
  try {
    const context = await getRequestContext(request);
    const { id, itemId } = await params;
    const result = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id);
      if (!contract) return null;
      requireContractPermission(context.principal, "contract.read", contract);
      const tracking = await new PostgresContractItemRepository(client).getTracking(id, itemId);
      if (!tracking) return null;
      return {
        tracking,
        capabilities: {
          canUpdateProgress: canContractPermission(context.principal, "contract.progress.update", contract),
        },
      };
    });
    return result
      ? Response.json(result, { headers: { "cache-control": "no-store" } })
      : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);
