import "server-only";

import type { PoolClient } from "pg";
import type { Contract, ContractStatus, Supervisor } from "../../types/contract";
import { decryptJson, encryptJson } from "../crypto/field-encryption";

export type ContractWriteInput = Omit<Contract, "id" | "stt" | "version">;

type SensitiveContractor = Pick<Contract, "contractorAddress" | "contractorPhone" | "contractorRepresentative">;
type SensitiveCommercial = Pick<Contract, "costNote" | "managementDirection" | "googleDriveFolderUrl">;

type ContractRow = Record<string, unknown> & {
  id: string; sequence_number: string; contract_number: string; package_name: string;
  lead_department: string; lead_department_id: string; contractor_id: string | null; contractor_name: string;
  contractor_sensitive_ciphertext: Buffer | null; commercial_sensitive_ciphertext: Buffer | null;
  progress_percent: number; status: ContractStatus; version: number; supervisors: Supervisor[] | null;
};

const selectContract = `SELECT c.*, d.code AS lead_department,
  ARRAY(SELECT cd.department_id::text FROM tcms.contract_departments cd WHERE cd.contract_id=c.id) AS department_ids,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id::text, 'fullName', s.full_name,
    'department', sd.code, 'role', s.supervisor_role) ORDER BY s.created_at)
    FROM tcms.contract_supervisors s JOIN tcms.departments sd ON sd.id = s.department_id
    WHERE s.contract_id = c.id), '[]'::jsonb) supervisors
  FROM tcms.contracts c JOIN tcms.departments d ON d.id = c.lead_department_id
  WHERE c.archived_at IS NULL`;

function date(value: unknown) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mapRow(row: ContractRow): Contract {
  const contractor = decryptJson<SensitiveContractor>(row.contractor_sensitive_ciphertext) ?? {};
  const commercial = decryptJson<SensitiveCommercial>(row.commercial_sensitive_ciphertext) ?? {};
  return {
    id: row.id, departmentIds: Array.isArray(row.department_ids) ? row.department_ids as string[] : [], stt: Number(row.sequence_number), version: row.version,
    contractNumber: row.contract_number, packageName: row.package_name,
    leadDepartment: row.lead_department, contractorId:row.contractor_id??undefined, contractorName: row.contractor_name,
    ...contractor, supervisors: row.supervisors ?? [],
    handoverDocument: row.handover_document as string | undefined,
    handoverDate: date(row.handover_date), signedDate: date(row.signed_date),
    contractDurationDays: row.contract_duration_days as number | undefined,
    serviceProvisionDurationDays: row.service_provision_duration_days as number | undefined,
    serviceDurationText: row.service_duration_text as string | undefined,
    unitExecutionDurationDays: row.unit_execution_duration_days as number | undefined,
    unitExecutionContinuous: typeof row.unit_execution_continuous === "boolean" ? row.unit_execution_continuous : undefined,
    unitExecutionTriggerText: row.unit_execution_trigger_text as string | undefined,
    effectiveConditionText: row.effective_condition_text as string | undefined,
    contractStartDate: date(row.contract_start_date), siteHandoverDate: date(row.site_handover_date),
    goodsEndDate: date(row.goods_end_date), serviceEndDate: date(row.service_end_date), contractEndDate: date(row.contract_end_date),
    isExtended: Boolean(row.is_extended), extendedUntil: date(row.extended_until),
    implementationInvitationDate: date(row.implementation_invitation_date),
    progressPercent: Number(row.progress_percent), progressNote: row.progress_note as string | undefined,
    ...commercial, paymentSettlementStatus: row.payment_settlement_status as string | undefined,
    status: row.status,
  };
}

function encrypted(input: ContractWriteInput) {
  return {
    contractor: encryptJson({ contractorAddress: input.contractorAddress, contractorPhone: input.contractorPhone, contractorRepresentative: input.contractorRepresentative }),
    commercial: encryptJson({ costNote: input.costNote, managementDirection: input.managementDirection, googleDriveFolderUrl: input.googleDriveFolderUrl }),
  };
}

async function replaceSupervisors(client: PoolClient, contractId: string, supervisors: Supervisor[], actorId: string) {
  await client.query("DELETE FROM tcms.contract_supervisors WHERE contract_id = $1", [contractId]);
  for (const supervisor of supervisors) {
    const result = await client.query(`INSERT INTO tcms.contract_supervisors
      (contract_id, full_name, department_id, supervisor_role, created_by)
      SELECT $1, $2, id, $4, $5 FROM tcms.departments WHERE code = $3 AND active
      RETURNING id`, [contractId, supervisor.fullName, supervisor.department, supervisor.role ?? "Giám sát", actorId]);
    if (!result.rowCount) throw new Error(`DEPARTMENT_NOT_FOUND:${supervisor.department}`);
  }
}

export class PostgresContractRepository {
  constructor(private readonly client: PoolClient) {}

  async list() { return (await this.client.query(`${selectContract} ORDER BY c.sequence_number`)).rows.map((row) => mapRow(row as ContractRow)); }
  async findById(id: string) { const row = (await this.client.query(`${selectContract} AND c.id = $1`, [id])).rows[0]; return row ? mapRow(row as ContractRow) : null; }

  async create(input: ContractWriteInput, actorId: string) {
    const contractor=await this.resolveContractor(input.contractorId);
    const secret = encrypted(input);
    const result = await this.client.query(`INSERT INTO tcms.contracts
      (contract_number, package_name, lead_department_id, contractor_id, contractor_name, contractor_sensitive_ciphertext,
       contractor_sensitive_key_version, handover_document, handover_date, signed_date, contract_duration_days,
       service_provision_duration_days, service_duration_text, unit_execution_duration_days, unit_execution_continuous,
       unit_execution_trigger_text, effective_condition_text, contract_start_date, site_handover_date, goods_end_date,
       service_end_date, contract_end_date, is_extended, extended_until, implementation_invitation_date, progress_percent,
       progress_note, commercial_sensitive_ciphertext, commercial_sensitive_key_version, payment_settlement_status,
       status, created_by, updated_by)
      SELECT $1,$2,d.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$31
      FROM tcms.departments d WHERE d.code=$32 AND d.active RETURNING id`,
      [input.contractNumber,input.packageName,contractor.id,contractor.name,secret.contractor.ciphertext,secret.contractor.keyVersion,
       input.handoverDocument,input.handoverDate||null,input.signedDate||null,input.contractDurationDays,
       input.serviceProvisionDurationDays,input.serviceDurationText,input.unitExecutionDurationDays,
       input.unitExecutionContinuous ?? null,input.unitExecutionTriggerText,input.effectiveConditionText,
       input.contractStartDate||null,input.siteHandoverDate||null,input.goodsEndDate||null,input.serviceEndDate||null,
       input.contractEndDate||null,input.isExtended,input.extendedUntil||null,input.implementationInvitationDate||null,
       input.progressPercent,input.progressNote,secret.commercial.ciphertext,secret.commercial.keyVersion,
       input.paymentSettlementStatus,input.status,actorId,input.leadDepartment]);
    if (!result.rowCount) throw new Error(`DEPARTMENT_NOT_FOUND:${input.leadDepartment}`);
    const id = result.rows[0].id as string;
    await this.client.query(`INSERT INTO tcms.contract_departments (contract_id, department_id, participation_type, assigned_by)
      SELECT $1,id,'LEAD',$2 FROM tcms.departments WHERE code=$3`, [id, actorId, input.leadDepartment]);
    await replaceSupervisors(this.client, id, input.supervisors, actorId);
    return (await this.findById(id))!;
  }

  async update(id: string, expectedVersion: number, input: ContractWriteInput, actorId: string) {
    const current = await this.findById(id);
    if (!current) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    if (input.leadDepartment !== current.leadDepartment) {
      const target = await this.client.query("SELECT id FROM tcms.departments WHERE code=$1 AND active AND (tcms.has_global_contract_scope() OR id=ANY(tcms.current_department_ids()))", [input.leadDepartment]);
      if (!target.rowCount) throw new Error("ACCESS_DENIED");
    }
    const supervisorsChanged = JSON.stringify(current.supervisors) !== JSON.stringify(input.supervisors);
    const contractor=await this.resolveContractor(input.contractorId,current.contractorId);
    const secret = encrypted(input);
    const result = await this.client.query(`UPDATE tcms.contracts c SET
      contract_number=$1, package_name=$2, lead_department_id=d.id, contractor_id=$3, contractor_name=$4,
      contractor_sensitive_ciphertext=$5, contractor_sensitive_key_version=$6, handover_document=$7, handover_date=$8,
      signed_date=$9, contract_duration_days=$10, service_provision_duration_days=$11, service_duration_text=$12,
      unit_execution_duration_days=$13, unit_execution_continuous=$14, unit_execution_trigger_text=$15,
      effective_condition_text=$16, contract_start_date=$17, site_handover_date=$18, goods_end_date=$19,
      service_end_date=$20, contract_end_date=$21, is_extended=$22, extended_until=$23,
      implementation_invitation_date=$24, progress_percent=$25, progress_note=$26,
      commercial_sensitive_ciphertext=$27, commercial_sensitive_key_version=$28,
      payment_settlement_status=$29, status=$30, updated_by=$31 FROM tcms.departments d
      WHERE c.id=$32 AND c.version=$33 AND d.code=$34 AND d.active RETURNING c.id`,
      [input.contractNumber,input.packageName,contractor.id,contractor.name,secret.contractor.ciphertext,secret.contractor.keyVersion,
       input.handoverDocument,input.handoverDate||null,input.signedDate||null,input.contractDurationDays,
       input.serviceProvisionDurationDays,input.serviceDurationText,input.unitExecutionDurationDays,
       input.unitExecutionContinuous ?? null,input.unitExecutionTriggerText,input.effectiveConditionText,
       input.contractStartDate||null,input.siteHandoverDate||null,input.goodsEndDate||null,input.serviceEndDate||null,
       input.contractEndDate||null,input.isExtended,input.extendedUntil||null,input.implementationInvitationDate||null,
       input.progressPercent,input.progressNote,secret.commercial.ciphertext,secret.commercial.keyVersion,
       input.paymentSettlementStatus,input.status,actorId,id,expectedVersion,input.leadDepartment]);
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    if (input.leadDepartment !== current.leadDepartment) {
      await this.client.query("UPDATE tcms.contract_departments SET department_id=(SELECT id FROM tcms.departments WHERE code=$2) WHERE contract_id=$1 AND participation_type='LEAD'", [id, input.leadDepartment]);
    }
    if (supervisorsChanged) await replaceSupervisors(this.client, id, input.supervisors, actorId);
    return (await this.findById(id))!;
  }

  private async resolveContractor(contractorId:string|undefined,currentContractorId?:string) {
    if(!contractorId) throw new SyntaxError("CONTRACTOR_REQUIRED");
    const result=await this.client.query(`SELECT id::text,name,active FROM tcms.contractors WHERE id=$1`,[contractorId]);
    const row=result.rows[0];
    if(!row||(!row.active&&contractorId!==currentContractorId)) throw new Error("CONTRACTOR_NOT_AVAILABLE");
    return {id:String(row.id),name:String(row.name)};
  }
}
