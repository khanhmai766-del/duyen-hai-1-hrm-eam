import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import type { PoolClient } from "pg";
import type { Contract } from "@/lib/tcms/types/contract";
import type { ContractItem } from "@/lib/tcms/types/contract-item";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseContractInput, requireRolePermission } from "@/lib/tcms/server/contracts/contract-api";
import { createContractImportAtomically } from "@/lib/tcms/server/contracts/contract-create-import";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { PostgresContractItemRepository } from "@/lib/tcms/server/contracts/postgres-contract-item-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { parseContractItemImportRequest } from "@/lib/tcms/server/pdf/contract-item-import";

async function GETHandler(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRolePermission(context.principal, "contract.read");
    const contracts = await withSecurityTransaction(context, (client) => new PostgresContractRepository(client).list());
    const permissions = permissionsForRoles(context.principal.roles);
    return Response.json({ contracts, capabilities: { canCreate: permissions.has("contract.create"), canEdit: permissions.has("contract.identity.update"), canAdminister: context.canAdminister && permissions.has("system.configure") } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRolePermission(context.principal, "contract.create");
    const rawBody = await request.json();
    const isPdfCreate = Boolean(
      rawBody && typeof rawBody === "object" &&
      "contract" in rawBody && "items" in rawBody,
    );

    if (!isPdfCreate) {
      const input = parseContractInput(rawBody);
      const contract = await withSecurityTransaction(context, (client) =>
        new PostgresContractRepository(client).create(input, context.principal.userId));
      return Response.json({ contract }, { status: 201, headers: { "cache-control": "no-store" } });
    }

    const importBody = rawBody as { contract?: unknown; redactionConfirmed?: unknown };
    if (importBody.redactionConfirmed !== true) {
      return Response.json({
        error: "REDACTION_CONFIRMATION_REQUIRED",
        message: "Cần xác nhận PDF đã loại thông tin nhạy cảm trước khi tạo hợp đồng từ bản nháp AI.",
      }, { status: 400 });
    }

    const contractInput = parseContractInput(importBody.contract);
    const entries = parseContractItemImportRequest(rawBody, 100);
    const result = await createContractImportAtomically<PoolClient, Contract, ContractItem>({
      runTransaction: (operation) => withSecurityTransaction(context, operation),
      createWriter: (client) => {
        const contractRepository = new PostgresContractRepository(client);
        const itemRepository = new PostgresContractItemRepository(client);
        return {
          createContract: (input, actorId) => contractRepository.create(input, actorId),
          contractId: (contract) => contract.id,
          createItem: (contractId, entry, actorId) => itemRepository.create(contractId, entry.input, actorId),
          itemId: (item) => item.id,
          createChecklistItems: async (itemId, descriptions, actorId) => {
            await itemRepository.createChecklistItems(itemId, descriptions, actorId);
          },
        };
      },
      contractInput,
      entries,
      actorId: context.principal.userId,
    });

    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
