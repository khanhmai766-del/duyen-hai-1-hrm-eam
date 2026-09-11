import "server-only";

import type { SecurityPrincipal, Role } from "../../lib/security/authorization";
import { ROLES } from "../../lib/security/authorization";
import { getPool } from "../db/pool";

export type AuthenticatedIdentity = { subject: string; mfaVerified: boolean };

export async function resolvePrincipal(identity: AuthenticatedIdentity): Promise<SecurityPrincipal> {
  const result = await getPool().query({
    text: `SELECT u.id::text,u.active,
      ARRAY(SELECT DISTINCT role_code FROM (
        SELECT s.role_code FROM tcms.user_role_scopes s WHERE s.user_id=u.id
          AND s.valid_from<=clock_timestamp() AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp())
        UNION ALL
        SELECT 'SUPERVISOR'::text FROM tcms.supervision_assignments a
          JOIN tcms.supervision_decisions d ON d.id=a.decision_id
          WHERE a.user_id=u.id AND d.status='ISSUED'
            AND d.effective_from<=current_date AND (d.effective_until IS NULL OR d.effective_until>=current_date)
            AND (a.active_from IS NULL OR a.active_from<=current_date)
            AND (a.active_until IS NULL OR a.active_until>=current_date)
            AND NOT EXISTS (SELECT 1 FROM tcms.user_role_scopes explicit_scope
              WHERE explicit_scope.user_id=u.id AND explicit_scope.role_code<>'SUPERVISOR'
                AND explicit_scope.valid_from<=clock_timestamp()
                AND (explicit_scope.valid_until IS NULL OR explicit_scope.valid_until>clock_timestamp()))
      ) active_roles) roles,
      ARRAY(SELECT DISTINCT s.department_id::text FROM tcms.user_role_scopes s WHERE s.user_id=u.id
        AND s.department_id IS NOT NULL AND s.valid_from<=clock_timestamp()
        AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp())) department_ids,
      ARRAY(SELECT DISTINCT contract_id FROM (
        SELECT s.contract_id::text contract_id FROM tcms.user_role_scopes s WHERE s.user_id=u.id
          AND s.contract_id IS NOT NULL AND s.valid_from<=clock_timestamp()
          AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp())
        UNION ALL
        SELECT a.contract_id::text FROM tcms.supervision_assignments a
          JOIN tcms.supervision_decisions d ON d.id=a.decision_id
          WHERE a.user_id=u.id AND d.status='ISSUED'
            AND d.effective_from<=current_date AND (d.effective_until IS NULL OR d.effective_until>=current_date)
            AND (a.active_from IS NULL OR a.active_from<=current_date)
            AND (a.active_until IS NULL OR a.active_until>=current_date)
            AND NOT EXISTS (SELECT 1 FROM tcms.user_role_scopes explicit_scope
              WHERE explicit_scope.user_id=u.id AND explicit_scope.role_code<>'SUPERVISOR'
                AND explicit_scope.valid_from<=clock_timestamp()
                AND (explicit_scope.valid_until IS NULL OR explicit_scope.valid_until>clock_timestamp()))
      ) active_contracts) contract_ids,
      EXISTS(SELECT 1 FROM tcms.user_role_scopes s WHERE s.user_id=u.id AND s.global_scope
        AND s.valid_from<=clock_timestamp() AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp())) global_scope
    FROM tcms.app_users u WHERE u.identity_subject=$1`,
    values: [identity.subject],
  });
  const row = result.rows[0];
  if (!row) throw new Error("SSO_USER_NOT_PROVISIONED");
  const validRoles = (row.roles as string[]).filter((role): role is Role => ROLES.includes(role as Role));
  return {
    userId: row.id,
    active: row.active,
    mfaVerified: identity.mfaVerified,
    roles: validRoles,
    departmentIds: row.department_ids,
    assignedContractIds: row.contract_ids,
    globalContractScope: row.global_scope,
  };
}
