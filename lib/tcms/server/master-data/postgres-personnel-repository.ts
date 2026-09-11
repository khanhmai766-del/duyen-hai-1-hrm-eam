import "server-only";

import type { PoolClient } from "pg";
import type {
  CreatePersonnelInput,
  Personnel,
  PersonnelRoleAssignmentInput,
  UpdatePersonnelInput,
} from "../../types/personnel";

function mapPersonnel(row: Record<string, unknown>): Personnel {
  const assignments = Array.isArray(row.role_assignments) ? row.role_assignments : [];
  return {
    id: String(row.id),
    identitySubject: String(row.identity_subject),
    username: String(row.username),
    displayName: String(row.display_name),
    primaryDepartmentId: row.primary_department_id ? String(row.primary_department_id) : null,
    primaryDepartmentName: row.primary_department_name ? String(row.primary_department_name) : null,
    active: Boolean(row.active),
    version: Number(row.version),
    lastIdentitySyncAt: row.last_identity_sync_at ? String(row.last_identity_sync_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    roleAssignments: assignments.map((item: Record<string, unknown>) => ({
      id: String(item.id),
      roleCode: String(item.roleCode) as Personnel["roleAssignments"][number]["roleCode"],
      roleName: String(item.roleName),
      scopeType: String(item.scopeType) as Personnel["roleAssignments"][number]["scopeType"],
      departmentId: item.departmentId ? String(item.departmentId) : null,
      departmentName: item.departmentName ? String(item.departmentName) : null,
      contractId: item.contractId ? String(item.contractId) : null,
      contractNumber: item.contractNumber ? String(item.contractNumber) : null,
      validFrom: String(item.validFrom),
      validUntil: item.validUntil ? String(item.validUntil) : null,
    })),
  };
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23505") throw new Error("PERSONNEL_IDENTITY_CONFLICT");
    if (error.code === "23503") throw new Error("PERSONNEL_REFERENCE_NOT_FOUND");
  }
  throw error;
}

const personnelSelect = `
  SELECT u.id,u.identity_subject,u.username,u.display_name,u.primary_department_id,
    d.name primary_department_name,u.active,u.version,u.last_identity_sync_at,u.created_at,u.updated_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id::text,'roleCode',s.role_code,'roleName',r.name,
      'scopeType',CASE WHEN s.global_scope THEN 'GLOBAL' WHEN s.department_id IS NOT NULL THEN 'DEPARTMENT' ELSE 'CONTRACT' END,
      'departmentId',s.department_id::text,'departmentName',sd.name,
      'contractId',s.contract_id::text,'contractNumber',c.contract_number,
      'validFrom',s.valid_from,'validUntil',s.valid_until
    ) ORDER BY r.name,sd.name,c.contract_number) FROM tcms.user_role_scopes s
      JOIN tcms.roles r ON r.code=s.role_code
      LEFT JOIN tcms.departments sd ON sd.id=s.department_id
      LEFT JOIN tcms.contracts c ON c.id=s.contract_id
      WHERE s.user_id=u.id), '[]'::jsonb) role_assignments
  FROM tcms.app_users u LEFT JOIN tcms.departments d ON d.id=u.primary_department_id`;

export class PostgresPersonnelRepository {
  constructor(private readonly client: PoolClient) {}

  async list() {
    const result = await this.client.query(`${personnelSelect} ORDER BY u.active DESC,u.display_name,u.username`);
    return result.rows.map(mapPersonnel);
  }

  async findById(id: string) {
    const result = await this.client.query(`${personnelSelect} WHERE u.id=$1`, [id]);
    return result.rowCount ? mapPersonnel(result.rows[0]) : null;
  }

  async options() {
    // A PoolClient owns one PostgreSQL connection; keep its queries sequential.
    // Concurrent client.query calls are deprecated by pg and will fail in pg 9.
    const roles = await this.client.query(`SELECT code,name FROM tcms.roles WHERE active ORDER BY name`);
    const departments = await this.client.query(`SELECT id::text,code,name FROM tcms.departments WHERE active ORDER BY code`);
    const contracts = await this.client.query(`SELECT id::text,contract_number,package_name FROM tcms.contracts WHERE archived_at IS NULL ORDER BY contract_number`);
    return {
      roles: roles.rows.map((row) => ({ code: String(row.code), name: String(row.name) })),
      departments: departments.rows.map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name) })),
      contracts: contracts.rows.map((row) => ({ id: String(row.id), contractNumber: String(row.contract_number), packageName: String(row.package_name) })),
    };
  }

  async create(input: CreatePersonnelInput, actorId: string) {
    try {
      const created = await this.client.query(
        `INSERT INTO tcms.app_users (identity_subject,username,display_name,primary_department_id,active)
         VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
        [input.identitySubject,input.username,input.displayName,input.primaryDepartmentId,input.active],
      );
      const id = String(created.rows[0].id);
      await this.replaceAssignments(id, input.roleAssignments, actorId);
      return (await this.findById(id))!;
    } catch (error) { return mapDatabaseError(error); }
  }

  async update(id: string, expectedVersion: number, input: UpdatePersonnelInput, actorId: string) {
    if (id === actorId) throw new Error("SELF_ACCOUNT_CHANGE_FORBIDDEN");
    try {
      const updated = await this.client.query(
        `UPDATE tcms.app_users SET username=$1,display_name=$2,primary_department_id=$3,active=$4
         WHERE id=$5 AND version=$6 RETURNING id`,
        [input.username,input.displayName,input.primaryDepartmentId,input.active,id,expectedVersion],
      );
      if (!updated.rowCount) throw new Error("PERSONNEL_CONCURRENT_UPDATE_OR_NOT_FOUND");
      await this.replaceAssignments(id, input.roleAssignments, actorId);
      return (await this.findById(id))!;
    } catch (error) { return mapDatabaseError(error); }
  }

  private async replaceAssignments(userId: string, assignments: PersonnelRoleAssignmentInput[], actorId: string) {
    await this.client.query(`DELETE FROM tcms.user_role_scopes WHERE user_id=$1`, [userId]);
    for (const assignment of assignments) {
      await this.client.query(
        `INSERT INTO tcms.user_role_scopes
          (user_id,role_code,department_id,contract_id,global_scope,valid_from,valid_until,granted_by)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,clock_timestamp()),$7::timestamptz,$8)`,
        [userId,assignment.roleCode,assignment.departmentId,assignment.contractId,assignment.scopeType === "GLOBAL",assignment.validFrom,assignment.validUntil,actorId],
      );
    }
  }
}
