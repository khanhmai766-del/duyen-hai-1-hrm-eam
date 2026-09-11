import "server-only";

import type { PoolClient } from "pg";
import type { Contractor, ContractorInput } from "../../types/contractor";
import { decryptJson, encryptJson } from "../crypto/field-encryption";

type ContractorSensitive = Pick<Contractor, "address" | "phone" | "representative">;

function mapContractor(row: Record<string, unknown>,includeSensitive:boolean): Contractor {
  const sensitive = includeSensitive ? decryptJson<ContractorSensitive>(row.sensitive_ciphertext as Buffer | null) ?? {} : {};
  return {
    id:String(row.id), code:String(row.code), name:String(row.name),
    taxCode:row.tax_code ? String(row.tax_code) : undefined,
    ...sensitive, active:Boolean(row.active), version:Number(row.version),
    contractCount:Number(row.contract_count), createdAt:String(row.created_at), updatedAt:String(row.updated_at),
  };
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    const constraint = "constraint" in error ? String(error.constraint) : "";
    throw new Error(constraint.includes("tax_code") ? "CONTRACTOR_TAX_CODE_CONFLICT" : "CONTRACTOR_CODE_CONFLICT");
  }
  throw error;
}

const selectContractor = `SELECT n.*,
  (SELECT count(*)::int FROM tcms.contracts c WHERE c.contractor_id=n.id AND c.archived_at IS NULL) contract_count
  FROM tcms.contractors n`;

export class PostgresContractorRepository {
  constructor(private readonly client: PoolClient) {}

  async list(includeInactive: boolean,includeSensitive:boolean) {
    const result = await this.client.query(`${selectContractor} WHERE n.active OR $1 ORDER BY n.active DESC,n.code`,[includeInactive]);
    return result.rows.map((row)=>mapContractor(row,includeSensitive));
  }

  async findById(id: string) {
    const result = await this.client.query(`${selectContractor} WHERE n.id=$1`,[id]);
    return result.rowCount ? mapContractor(result.rows[0],true) : null;
  }

  async create(input: ContractorInput, actorId: string) {
    const encrypted = encryptJson({ address:input.address, phone:input.phone, representative:input.representative });
    try {
      const result = await this.client.query(
        `INSERT INTO tcms.contractors(code,name,tax_code,sensitive_ciphertext,sensitive_key_version,active,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [input.code,input.name,input.taxCode,encrypted.ciphertext,encrypted.keyVersion,input.active,actorId],
      );
      return (await this.findById(String(result.rows[0].id)))!;
    } catch (error) { return mapDatabaseError(error); }
  }

  async update(id: string, expectedVersion: number, input: ContractorInput, actorId: string) {
    const encrypted = encryptJson({ address:input.address, phone:input.phone, representative:input.representative });
    try {
      const result = await this.client.query(
        `UPDATE tcms.contractors SET code=$1,name=$2,tax_code=$3,sensitive_ciphertext=$4,
          sensitive_key_version=$5,active=$6,updated_by=$7 WHERE id=$8 AND version=$9 RETURNING id`,
        [input.code,input.name,input.taxCode,encrypted.ciphertext,encrypted.keyVersion,input.active,actorId,id,expectedVersion],
      );
      if (!result.rowCount) throw new Error("CONTRACTOR_CONCURRENT_UPDATE_OR_NOT_FOUND");
      return (await this.findById(id))!;
    } catch (error) { return mapDatabaseError(error); }
  }
}
