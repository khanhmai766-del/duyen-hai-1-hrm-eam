import "server-only";

import type { PoolClient } from "pg";
import { permissionsForRoles, type SecurityPrincipal } from "../../lib/security/authorization";
import { getPool } from "./pool";

export type DatabaseRequestContext = {
  principal: SecurityPrincipal;
  correlationId: string;
};

export async function withSecurityTransaction<T>(
  context: DatabaseRequestContext,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // The contract module shares the website database login. FORCE RLS on every
    // business table keeps the owner subject to policies as well.
    await client.query("SET LOCAL row_security = on");
    const role = await client.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    if (!role.rows.length || role.rows[0].rolsuper || role.rows[0].rolbypassrls) throw new Error("TCMS_UNSAFE_DATABASE_ROLE");
    const permissions = [...permissionsForRoles(context.principal.roles), "audit.write"];
    const settings: Array<[string, string]> = [
      ["app.actor_id", context.principal.userId],
      ["app.permissions", JSON.stringify(permissions)],
      ["app.department_ids", JSON.stringify(context.principal.departmentIds)],
      ["app.assigned_contract_ids", JSON.stringify(context.principal.assignedContractIds)],
      ["app.global_contract_scope", String(Boolean(context.principal.globalContractScope))],
      ["app.environment", process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development"],
      ["app.correlation_id", context.correlationId],
      ["app.app_version", process.env.APP_VERSION ?? "development"],
    ];
    for (const [name, value] of settings) {
      await client.query("SELECT set_config($1, $2, true)", [name, value]);
    }
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
