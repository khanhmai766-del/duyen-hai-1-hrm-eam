import "server-only";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/api";
import { requirePermissionLevel, hasPermissionLevel } from "@/lib/rbac-guard";
import { resolvePrincipal } from "../auth/identity";

export class AuthenticationError extends Error {}

async function resolveRequestContext(request: Request) {
  const user = await requireUser();
  await requirePermissionLevel(user, "contract-access", ["read", "personal", "manage", "full"], "Bạn không có quyền truy cập quản lý hợp đồng.");
  const principal = await resolvePrincipal({ subject: `vh1:${user.id}`, mfaVerified: false });
  principal.websiteSession = true;
  const canAdminister = await hasPermissionLevel(user, "contract-access", ["full"]);
  // Contract roles never grant access to website administration or invent MFA claims.
  if (!canAdminister) principal.roles = principal.roles.filter((role) => role !== "SYSTEM_ADMIN");
  if (!principal.active) throw new AuthenticationError("INACTIVE_PRINCIPAL");
  return {
    principal,
    websiteUserId: user.id,
    canAdminister,
    correlationId: randomUUID(),
    sourceIp: null,
    userAgent: request.headers.get("user-agent"),
  };
}

const contexts = new WeakMap<Request, ReturnType<typeof resolveRequestContext>>();
export function getRequestContext(request: Request) {
  let result = contexts.get(request);
  if (!result) {
    result = resolveRequestContext(request);
    contexts.set(request, result);
  }
  return result;
}
