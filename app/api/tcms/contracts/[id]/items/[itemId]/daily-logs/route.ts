import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { parseDailyLogInput } from "@/lib/tcms/server/contracts/contract-item-service";
import { PostgresContractItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-item-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";

async function POSTHandler(request: Request, { params }: { params: { id: string; itemId: string } }) {
  try {
    const context = await getRequestContext(request);
    const { id, itemId } = await params;
    const input = parseDailyLogInput(await request.json());
    const log = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id);
      if (!contract) return null;
      requireContractPermission(context.principal, "contract.progress.update", contract);
      return new PostgresContractItemRepository(client).appendDailyLog(
        id,
        itemId,
        input.logDate,
        input.note,
        context.principal.userId,
      );
    });
    return log ? Response.json({ log }, { status: 201 }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";

export const POST = adaptTcmsRoute(POSTHandler);
