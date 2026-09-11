import { websiteIdentity } from "@/lib/tcms/server/master-data/website-personnel";
import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parsePersonnelVersion, parseUpdatePersonnelInput } from "@/lib/tcms/server/master-data/personnel-service";
import { PostgresPersonnelRepository } from "@/lib/tcms/server/master-data/postgres-personnel-repository";

async function PATCHHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request);
    const permissions = permissionsForRoles(context.principal.roles);
    if (!context.principal.active || !context.canAdminister || !permissions.has("user.manage") || !permissions.has("role.manage")) throw new Error("ACCESS_DENIED");
    const body = await request.json();
    const input = parseUpdatePersonnelInput(body.personnel);
    const expectedVersion = parsePersonnelVersion(body.expectedVersion);
    const { id } = await params;
    const personnel = await withSecurityTransaction(context, async (client) => {
      const repository = new PostgresPersonnelRepository(client);
      const current = await repository.findById(id);
      if (!current) throw new Error("PERSONNEL_CONCURRENT_UPDATE_OR_NOT_FOUND");
      const identity = await websiteIdentity(current.identitySubject);
      return repository.update(id, expectedVersion, { ...input, ...identity }, context.principal.userId);
    });
    return Response.json({ personnel });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const PATCH = adaptTcmsRoute(PATCHHandler);
