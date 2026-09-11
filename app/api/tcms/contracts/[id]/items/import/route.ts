import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { summarizeContractItems } from "@/lib/tcms/server/contracts/contract-item-service";
import { PostgresContractItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-item-repository";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseContractItemImportRequest } from "@/lib/tcms/server/pdf/contract-item-import";

async function POSTHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request);
    const { id } = await params;
    const rawBody = await request.json();
    const result = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id);
      if (!contract) return null;
      requireContractPermission(context.principal, "contract.identity.update", contract);

      const repository = new PostgresContractItemRepository(client);
      const existingItems = await repository.list(id);
      const existingWeightTotal = existingItems.reduce((sum, item) => sum + item.weightPercent, 0);
      const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);

      const entries = parseContractItemImportRequest(rawBody, availableWeightPercent);
      const importWeightTotal = entries.reduce((sum, entry) => sum + entry.input.weightPercent, 0);

      if (existingWeightTotal + importWeightTotal > 100.005) {
        throw new Error("CONTRACT_ITEM_WEIGHT_TOTAL_EXCEEDED");
      }

      const created = [];
      for (const entry of entries) {
        const item = await repository.create(id, entry.input, context.principal.userId);
        await repository.createChecklistItems(item.id, entry.checklistItems, context.principal.userId);
        created.push(item);
      }
      const items = await repository.list(id);
      return { created, summary: summarizeContractItems(items) };
    });

    return result
      ? Response.json(result, { status: 201, headers: { "cache-control": "no-store" } })
      : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";

export const POST = adaptTcmsRoute(POSTHandler);
