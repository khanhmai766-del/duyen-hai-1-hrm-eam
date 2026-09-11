import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { parseExpectedVersion, parseWorkScopeInput } from "@/lib/tcms/server/contracts/contract-structure-service";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { PostgresContractStructureRepository } from "@/lib/tcms/server/contracts/postgres-contract-structure-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";

type Params = { params: { id: string; scopeId: string } };

async function PATCHHandler(request: Request, { params }: Params) {
  try {
    const context = await getRequestContext(request); const { id, scopeId } = await params;
    const body = await request.json() as { scope?: unknown; expectedVersion?: unknown };
    const input = parseWorkScopeInput(body.scope); const expectedVersion = parseExpectedVersion(body.expectedVersion);
    const scope = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id); if (!contract) return null;
      requireContractPermission(context.principal, "contract.identity.update", contract);
      return new PostgresContractStructureRepository(client).updateWorkScope(id, scopeId, expectedVersion, input, context.principal.userId);
    });
    return scope ? Response.json({ scope }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

async function DELETEHandler(request: Request, { params }: Params) {
  try {
    const context = await getRequestContext(request); const { id, scopeId } = await params;
    const expectedVersion = parseExpectedVersion((await request.json() as { expectedVersion?: unknown }).expectedVersion);
    const found = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id); if (!contract) return false;
      requireContractPermission(context.principal, "contract.identity.update", contract);
      await new PostgresContractStructureRepository(client).deleteWorkScope(id, scopeId, expectedVersion); return true;
    });
    return found ? new Response(null, { status: 204 }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);

export const DELETE = adaptTcmsRoute(DELETEHandler);
