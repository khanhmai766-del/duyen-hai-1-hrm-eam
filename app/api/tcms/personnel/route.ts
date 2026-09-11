import { websiteIdentity, websitePersonnelOptions } from "@/lib/tcms/server/master-data/website-personnel";
import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { permissionsForRoles } from "@/lib/tcms/lib/security/authorization";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { parseCreatePersonnelInput } from "@/lib/tcms/server/master-data/personnel-service";
import { PostgresPersonnelRepository } from "@/lib/tcms/server/master-data/postgres-personnel-repository";

function requirePersonnelManager(context: Awaited<ReturnType<typeof getRequestContext>>) {
  const permissions = permissionsForRoles(context.principal.roles);
  if (!context.principal.active || !context.canAdminister || !permissions.has("user.manage") || !permissions.has("role.manage")) {
    throw new Error("ACCESS_DENIED");
  }
}

async function GETHandler(request: Request) {
  try {
    const context = await getRequestContext(request);
    requirePersonnelManager(context);
    const result = await withSecurityTransaction(context, async (client) => {
      const repository = new PostgresPersonnelRepository(client);
      return { personnel: await repository.list(), options: await repository.options() };
    });
    return Response.json({ ...result, options: { ...result.options, websiteUsers: await websitePersonnelOptions() }, capabilities: { canManage: true, currentUserId: context.principal.userId } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}

async function POSTHandler(request: Request) {
  try {
    const context = await getRequestContext(request);
    requirePersonnelManager(context);
    const raw = await request.json();
    if (typeof raw?.identitySubject !== "string") throw new SyntaxError("INVALID_WEBSITE_ACCOUNT");
    const identity = await websiteIdentity(raw.identitySubject);
    const input = parseCreatePersonnelInput({ ...raw, ...identity });
    const personnel = await withSecurityTransaction(context, (client) => new PostgresPersonnelRepository(client).create(input, context.principal.userId));
    return Response.json({ personnel }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export const dynamic = "force-dynamic";

export const GET = adaptTcmsRoute(GETHandler);

export const POST = adaptTcmsRoute(POSTHandler);
