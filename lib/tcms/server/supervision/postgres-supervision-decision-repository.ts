import "server-only";

import type { PoolClient } from "pg";
import type {
  SupervisionAssignmentInput,
  SupervisionDecision,
  SupervisionDecisionInput,
  SupervisionDecisionOptions,
} from "../../types/supervision-decision";
import { assertSupervisionDecisionUpdate,supervisionAssignmentsChanged } from "./supervision-decision-service";

function optional(value: unknown) { return value === null ? undefined : String(value); }

function mapDecision(row: Record<string, unknown>): SupervisionDecision {
  const assignments = Array.isArray(row.assignments) ? row.assignments : [];
  return {
    id: String(row.id), contractId: String(row.contract_id), contractNumber: String(row.contract_number), packageName: String(row.package_name),
    decisionNumber: String(row.decision_number), decisionDate: String(row.decision_date), title: String(row.title),
    effectiveFrom: String(row.effective_from), effectiveUntil: optional(row.effective_until),
    status: row.status as SupervisionDecision["status"], notes: optional(row.notes), version: Number(row.version),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    assignments: assignments.map((item: Record<string, unknown>) => ({
      id: String(item.id), userId: String(item.userId), displayName: String(item.displayName),
      departmentId: item.departmentId ? String(item.departmentId) : null,
      departmentCode: item.departmentCode ? String(item.departmentCode) : null,
      departmentName: item.departmentName ? String(item.departmentName) : null,
      workScopeId: optional(item.workScopeId), workScopeCode: optional(item.workScopeCode), workScopeName: optional(item.workScopeName),
      supervisorRole: String(item.supervisorRole), responsibility: optional(item.responsibility),
      activeFrom: optional(item.activeFrom), activeUntil: optional(item.activeUntil),
    })),
  };
}

const selectDecisions = `
  SELECT d.*,c.contract_number,c.package_name,COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id::text,'userId',a.user_id::text,'displayName',u.display_name,
    'departmentId',u.primary_department_id::text,'departmentCode',dep.code,'departmentName',dep.name,
    'workScopeId',a.work_scope_id::text,'workScopeCode',w.code,'workScopeName',w.name,
    'supervisorRole',a.supervisor_role,'responsibility',a.responsibility,
    'activeFrom',a.active_from,'activeUntil',a.active_until
  ) ORDER BY u.display_name,w.sequence NULLS FIRST,a.created_at)
  FROM tcms.supervision_assignments a JOIN tcms.app_users u ON u.id=a.user_id
  LEFT JOIN tcms.departments dep ON dep.id=u.primary_department_id
  LEFT JOIN tcms.work_scopes w ON w.id=a.work_scope_id
  WHERE a.decision_id=d.id),'[]'::jsonb) assignments
  FROM tcms.supervision_decisions d JOIN tcms.contracts c ON c.id=d.contract_id`;

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23505") throw new Error("SUPERVISION_DECISION_NUMBER_CONFLICT");
    if (error.code === "23503") throw new Error("SUPERVISION_REFERENCE_NOT_FOUND");
    if (error.code === "23514") throw new SyntaxError("INVALID_SUPERVISION_DECISION_FIELDS");
  }
  throw error;
}

export class PostgresSupervisionDecisionRepository {
  constructor(private readonly client: PoolClient) {}

  async list() {
    const result = await this.client.query(`${selectDecisions} ORDER BY d.decision_date DESC,d.created_at DESC`);
    return result.rows.map((row) => mapDecision(row as Record<string, unknown>));
  }

  async findById(id: string) {
    const result = await this.client.query(`${selectDecisions} WHERE d.id=$1`, [id]);
    return result.rowCount ? mapDecision(result.rows[0] as Record<string, unknown>) : null;
  }

  async options(): Promise<SupervisionDecisionOptions> {
    const contracts = await this.client.query(`SELECT id::text,contract_number,package_name FROM tcms.contracts WHERE archived_at IS NULL ORDER BY contract_number`);
    const personnel = await this.client.query(`SELECT u.id::text,u.display_name,u.primary_department_id::text,d.code department_code,d.name department_name
      FROM tcms.app_users u LEFT JOIN tcms.departments d ON d.id=u.primary_department_id WHERE u.active ORDER BY u.display_name`);
    const scopes = await this.client.query(`SELECT id::text,contract_id::text,code,name FROM tcms.work_scopes ORDER BY contract_id,parent_scope_id NULLS FIRST,sequence`);
    return {
      contracts: contracts.rows.map((row) => ({ id:String(row.id),contractNumber:String(row.contract_number),packageName:String(row.package_name) })),
      personnel: personnel.rows.map((row) => ({ id:String(row.id),displayName:String(row.display_name),departmentId:row.primary_department_id?String(row.primary_department_id):null,departmentCode:row.department_code?String(row.department_code):null,departmentName:row.department_name?String(row.department_name):null })),
      workScopes: scopes.rows.map((row) => ({ id:String(row.id),contractId:String(row.contract_id),code:row.code?String(row.code):undefined,name:String(row.name) })),
    };
  }

  async create(input: SupervisionDecisionInput, actorId: string) {
    try {
      const result = await this.client.query(`INSERT INTO tcms.supervision_decisions
        (contract_id,decision_number,decision_date,title,effective_from,effective_until,status,notes,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id::text`,
        [input.contractId,input.decisionNumber,input.decisionDate,input.title,input.effectiveFrom,input.effectiveUntil,input.status,input.notes,actorId]);
      const id=String(result.rows[0].id); await this.replaceAssignments(id,input.contractId,input.assignments,actorId);
      return (await this.findById(id))!;
    } catch(error) { return mapDatabaseError(error); }
  }

  async update(id: string, expectedVersion: number, input: SupervisionDecisionInput, actorId: string) {
    try {
      const current=await this.findById(id);
      if(!current||current.version!==expectedVersion) throw new Error("SUPERVISION_DECISION_CONCURRENT_UPDATE_OR_NOT_FOUND");
      assertSupervisionDecisionUpdate(current,input);
      const assignmentsChanged=supervisionAssignmentsChanged(current,input);
      const result = await this.client.query(`UPDATE tcms.supervision_decisions SET contract_id=$1,decision_number=$2,decision_date=$3,
        title=$4,effective_from=$5,effective_until=$6,status=$7,notes=$8,updated_by=$9 WHERE id=$10 AND version=$11 RETURNING id`,
        [input.contractId,input.decisionNumber,input.decisionDate,input.title,input.effectiveFrom,input.effectiveUntil,input.status,input.notes,actorId,id,expectedVersion]);
      if(!result.rowCount) throw new Error("SUPERVISION_DECISION_CONCURRENT_UPDATE_OR_NOT_FOUND");
      if(assignmentsChanged) await this.replaceAssignments(id,input.contractId,input.assignments,actorId);
      return (await this.findById(id))!;
    } catch(error) { return mapDatabaseError(error); }
  }

  private async replaceAssignments(decisionId: string, contractId: string, assignments: SupervisionAssignmentInput[], actorId: string) {
    await this.client.query(`DELETE FROM tcms.supervision_assignments WHERE decision_id=$1`,[decisionId]);
    for(const item of assignments) {
      const result=await this.client.query(`INSERT INTO tcms.supervision_assignments
        (decision_id,contract_id,user_id,work_scope_id,supervisor_role,responsibility,active_from,active_until,created_by,updated_by)
        SELECT $1,$2,u.id,$4,$5,$6,$7,$8,$9,$9 FROM tcms.app_users u
        WHERE u.id=$3 AND u.active RETURNING id`,
        [decisionId,contractId,item.userId,item.workScopeId,item.supervisorRole,item.responsibility,item.activeFrom,item.activeUntil,actorId]);
      if(!result.rowCount) throw new Error("SUPERVISION_PERSONNEL_NOT_AVAILABLE");
    }
  }
}
