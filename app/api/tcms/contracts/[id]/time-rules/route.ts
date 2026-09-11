import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { canContractPermission, requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { parseContractTimeRuleInput } from "@/lib/tcms/server/contracts/contract-structure-service";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { PostgresContractStructureRepository } from "@/lib/tcms/server/contracts/postgres-contract-structure-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";

async function GETHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request); const { id } = await params;
    const result = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id); if (!contract) return null;
      requireContractPermission(context.principal, "contract.read", contract);
      return { rules: await new PostgresContractStructureRepository(client).listTimeRules(id),
        capabilities: { canUpdate: canContractPermission(context.principal, "contract.identity.update", contract) } };
    });
    return result ? Response.json(result, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request); const { id } = await params; const input = parseContractTimeRuleInput(await request.json());
    const rule = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id); if (!contract) return null;
      requireContractPermission(context.principal, "contract.identity.update", contract);
      return new PostgresContractStructureRepository(client).createTimeRule(id, input, context.principal.userId);
    });
    return rule ? Response.json({ rule }, { status: 201 }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
