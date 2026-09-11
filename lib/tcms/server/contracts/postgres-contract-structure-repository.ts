import "server-only";

import type { PoolClient } from "pg";
import type { ContractTimeRule, ContractTimeRuleInput, WorkScope, WorkScopeInput } from "../../types/contract-structure";

const optional = (value: unknown) => value === null ? undefined : value;

function mapTimeRule(row: Record<string, unknown>): ContractTimeRule {
  return {
    id: String(row.id), contractId: String(row.contract_id), scopeType: row.scope_type as ContractTimeRule["scopeType"],
    workScopeId: optional(row.work_scope_id) as string | undefined, ruleType: optional(row.rule_type) as string | undefined,
    durationValue: row.duration_value === null ? undefined : Number(row.duration_value), durationUnit: optional(row.duration_unit) as ContractTimeRule["durationUnit"],
    isContinuous: optional(row.is_continuous) as boolean | undefined, startTriggerType: optional(row.start_trigger_type) as string | undefined,
    startTriggerDescription: optional(row.start_trigger_description) as string | undefined, endTriggerType: optional(row.end_trigger_type) as string | undefined,
    endTriggerDescription: optional(row.end_trigger_description) as string | undefined, rawClause: optional(row.raw_clause) as string | undefined,
    sourcePage: row.source_page === null ? undefined : Number(row.source_page), evidence: optional(row.evidence) as string | undefined,
    confidence: row.confidence === null ? undefined : Number(row.confidence), sequence: Number(row.sequence), version: Number(row.version),
  };
}

function mapScope(row: Record<string, unknown>): WorkScope {
  return {
    id: String(row.id), contractId: String(row.contract_id), parentScopeId: optional(row.parent_scope_id) as string | undefined,
    scopeType: row.scope_type as WorkScope["scopeType"], code: optional(row.code) as string | undefined, name: String(row.name),
    description: optional(row.description) as string | undefined, sequence: Number(row.sequence),
    sourcePage: row.source_page === null ? undefined : Number(row.source_page), evidence: optional(row.evidence) as string | undefined,
    confidence: row.confidence === null ? undefined : Number(row.confidence), version: Number(row.version),
  };
}

export class PostgresContractStructureRepository {
  constructor(private readonly client: PoolClient) {}

  async listTimeRules(contractId: string) {
    const result = await this.client.query("SELECT * FROM tcms.contract_time_rules WHERE contract_id=$1 ORDER BY sequence", [contractId]);
    return result.rows.map(mapTimeRule);
  }

  async createTimeRule(contractId: string, input: ContractTimeRuleInput, actorId: string) {
    const result = await this.client.query(
      `INSERT INTO tcms.contract_time_rules
       (contract_id,scope_type,work_scope_id,rule_type,duration_value,duration_unit,is_continuous,start_trigger_type,start_trigger_description,
        end_trigger_type,end_trigger_description,raw_clause,source_page,evidence,confidence,sequence,created_by,updated_by)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE(MAX(sequence),0)+1,$16,$16
       FROM tcms.contract_time_rules WHERE contract_id=$1 RETURNING *`,
      [contractId,input.scopeType,input.workScopeId,input.ruleType,input.durationValue,input.durationUnit,input.isContinuous,input.startTriggerType,
       input.startTriggerDescription,input.endTriggerType,input.endTriggerDescription,input.rawClause,input.sourcePage,input.evidence,input.confidence,actorId],
    );
    return mapTimeRule(result.rows[0]);
  }

  async updateTimeRule(contractId: string, ruleId: string, expectedVersion: number, input: ContractTimeRuleInput, actorId: string) {
    const result = await this.client.query(
      `UPDATE tcms.contract_time_rules SET scope_type=$1,work_scope_id=$2,rule_type=$3,duration_value=$4,duration_unit=$5,is_continuous=$6,
       start_trigger_type=$7,start_trigger_description=$8,end_trigger_type=$9,end_trigger_description=$10,raw_clause=$11,source_page=$12,
       evidence=$13,confidence=$14,updated_by=$15 WHERE contract_id=$16 AND id=$17 AND version=$18 RETURNING *`,
      [input.scopeType,input.workScopeId,input.ruleType,input.durationValue,input.durationUnit,input.isContinuous,input.startTriggerType,input.startTriggerDescription,
       input.endTriggerType,input.endTriggerDescription,input.rawClause,input.sourcePage,input.evidence,input.confidence,actorId,contractId,ruleId,expectedVersion],
    );
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    return mapTimeRule(result.rows[0]);
  }

  async deleteTimeRule(contractId: string, ruleId: string, expectedVersion: number) {
    const result = await this.client.query("DELETE FROM tcms.contract_time_rules WHERE contract_id=$1 AND id=$2 AND version=$3", [contractId,ruleId,expectedVersion]);
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
  }

  async listWorkScopes(contractId: string) {
    const result = await this.client.query("SELECT * FROM tcms.work_scopes WHERE contract_id=$1 ORDER BY parent_scope_id NULLS FIRST,sequence", [contractId]);
    return result.rows.map(mapScope);
  }

  async createWorkScope(contractId: string, input: WorkScopeInput, actorId: string) {
    const result = await this.client.query(
      `INSERT INTO tcms.work_scopes
       (contract_id,parent_scope_id,scope_type,code,name,description,sequence,source_page,evidence,confidence,created_by,updated_by)
       SELECT $1,$2,$3,$4,$5,$6,COALESCE(MAX(sequence),0)+1,$7,$8,$9,$10,$10
       FROM tcms.work_scopes WHERE contract_id=$1 AND parent_scope_id IS NOT DISTINCT FROM $2::uuid RETURNING *`,
      [contractId,input.parentScopeId,input.scopeType,input.code,input.name,input.description,input.sourcePage,input.evidence,input.confidence,actorId],
    );
    return mapScope(result.rows[0]);
  }

  async updateWorkScope(contractId: string, scopeId: string, expectedVersion: number, input: WorkScopeInput, actorId: string) {
    const result = await this.client.query(
      `UPDATE tcms.work_scopes SET parent_scope_id=$1,
       sequence=CASE WHEN parent_scope_id IS DISTINCT FROM $1::uuid THEN
         (SELECT COALESCE(MAX(sibling.sequence),0)+1 FROM tcms.work_scopes sibling
          WHERE sibling.contract_id=$10 AND sibling.parent_scope_id IS NOT DISTINCT FROM $1::uuid AND sibling.id<>$11)
         ELSE sequence END,
       scope_type=$2,code=$3,name=$4,description=$5,source_page=$6,evidence=$7,
       confidence=$8,updated_by=$9 WHERE contract_id=$10 AND id=$11 AND version=$12 AND ($1::uuid IS NULL OR $1<>$11) RETURNING *`,
      [input.parentScopeId,input.scopeType,input.code,input.name,input.description,input.sourcePage,input.evidence,input.confidence,actorId,contractId,scopeId,expectedVersion],
    );
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    return mapScope(result.rows[0]);
  }

  async deleteWorkScope(contractId: string, scopeId: string, expectedVersion: number) {
    const result = await this.client.query("DELETE FROM tcms.work_scopes WHERE contract_id=$1 AND id=$2 AND version=$3", [contractId,scopeId,expectedVersion]);
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
  }
}
