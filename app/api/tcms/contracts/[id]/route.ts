import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseContractInput, requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";

async function GETHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request);
    const { id } = await params;
    const contract = await withSecurityTransaction(context, (client) => new PostgresContractRepository(client).findById(id));
    if (!contract) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    requireContractPermission(context.principal, "contract.read", contract);
    return Response.json({ contract }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}

async function PUTHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request);
    const { id } = await params;
    const body = await request.json() as { contract?: unknown; expectedVersion?: unknown };
    const input = parseContractInput(body.contract);
    if (!Number.isInteger(body.expectedVersion)) throw new SyntaxError("EXPECTED_VERSION_REQUIRED");
    const contract = await withSecurityTransaction(context, async (client) => {
      const repository = new PostgresContractRepository(client);
      const current = await repository.findById(id);
      if (!current) return null;
      requireContractPermission(context.principal, "contract.identity.update", current);
      if (input.progressPercent !== current.progressPercent || input.progressNote !== current.progressNote) requireContractPermission(context.principal, "contract.progress.update", current);
      if (input.costNote !== current.costNote || input.paymentSettlementStatus !== current.paymentSettlementStatus) requireContractPermission(context.principal, "contract.finance.update", current);
      if (JSON.stringify(input.supervisors) !== JSON.stringify(current.supervisors)) requireContractPermission(context.principal, "contract.assignment.manage", current);
      if (input.status !== current.status) requireContractPermission(context.principal, "contract.status.transition", current);
      return repository.update(id, body.expectedVersion as number, input, context.principal.userId);
    });
    if (!contract) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json({ contract }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const PUT = adaptTcmsRoute(PUTHandler);
