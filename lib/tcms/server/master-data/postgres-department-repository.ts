import "server-only";

import type { PoolClient } from "pg";
import type { Department, DepartmentInput } from "../../types/department";

function mapDepartment(row: Record<string, unknown>): Department {
  return {
    id: String(row.id), code: String(row.code), name: String(row.name), active: Boolean(row.active),
    version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new Error("DEPARTMENT_CODE_CONFLICT");
  }
  throw error;
}

export class PostgresDepartmentRepository {
  constructor(private readonly client: PoolClient) {}

  async list(includeInactive: boolean) {
    const result = await this.client.query(
      `SELECT id,code,name,active,version,created_at,updated_at FROM tcms.departments
       WHERE active OR $1 ORDER BY active DESC, code`, [includeInactive],
    );
    return result.rows.map(mapDepartment);
  }

  async create(input: DepartmentInput) {
    try {
      const result = await this.client.query(
        `INSERT INTO tcms.departments (code,name,active) VALUES ($1,$2,$3) RETURNING *`,
        [input.code, input.name, input.active],
      );
      return mapDepartment(result.rows[0]);
    } catch (error) { return mapConflict(error); }
  }

  async update(id: string, expectedVersion: number, input: DepartmentInput) {
    try {
      const result = await this.client.query(
        `UPDATE tcms.departments SET code=$1,name=$2,active=$3
         WHERE id=$4 AND version=$5 RETURNING *`,
        [input.code, input.name, input.active, id, expectedVersion],
      );
      if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
      return mapDepartment(result.rows[0]);
    } catch (error) { return mapConflict(error); }
  }
}
