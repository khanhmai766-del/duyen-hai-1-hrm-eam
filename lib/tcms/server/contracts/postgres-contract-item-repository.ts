import "server-only";

import type { PoolClient } from "pg";
import type {
  ContractItem,
  ContractItemChecklistItem,
  ContractItemDailyLog,
  ContractItemInput,
  ContractItemTracking,
} from "../../types/contract-item";

type ItemRow = Record<string, unknown> & { id: string; contract_id: string; sequence_number: number; version: number };

function date(value: unknown) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mapRow(row: ItemRow): ContractItem {
  return {
    id: row.id, contractId: row.contract_id, sequenceNumber: Number(row.sequence_number), version: Number(row.version),
    workScopeId: row.work_scope_id ? String(row.work_scope_id) : undefined,
    itemCode: row.item_code as string | undefined, groupCode: row.group_code as string | undefined, groupName: row.group_name as string | undefined,
    serviceDescription: String(row.item_name), workContent: row.description as string | undefined,
    quantity: row.contract_quantity === null ? undefined : Number(row.contract_quantity), completedQuantity: row.completed_quantity === null ? undefined : Number(row.completed_quantity),
    unit: row.unit as string | undefined, serviceLocation: row.service_location as string | undefined,
    completionDurationDays: row.completion_duration_days === null ? undefined : Number(row.completion_duration_days),
    weightPercent: Number(row.weight_percent ?? 0), progressPercent: Number(row.progress_percent),
    plannedStartDate: date(row.planned_start_date), plannedEndDate: date(row.planned_end_date), actualStartDate: date(row.actual_start_date), actualEndDate: date(row.actual_end_date),
    status: row.status as ContractItem["status"], progressNote: row.progress_note as string | undefined, acceptanceStatus: row.acceptance_status as string | undefined,
  };
}

function mapChecklistRow(row: Record<string, unknown>): ContractItemChecklistItem {
  return {
    id: String(row.id),
    contractItemId: String(row.contract_item_id),
    sequenceNumber: Number(row.sequence_number),
    description: String(row.description),
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    completedBy: row.completed_by ? String(row.completed_by) : null,
    version: Number(row.version),
  };
}

function mapDailyLogRow(row: Record<string, unknown>): ContractItemDailyLog {
  return {
    id: String(row.id),
    contractItemId: String(row.contract_item_id),
    logDate: date(row.log_date) ?? "",
    note: String(row.note),
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

const columns = `(contract_id,sequence_number,item_code,group_code,group_name,item_name,item_type,description,unit,contract_quantity,
  work_scope_id,completed_quantity,service_location,completion_duration_days,weight_percent,progress_percent,planned_start_date,planned_end_date,
  actual_start_date,actual_end_date,status,progress_note,acceptance_status,created_by,updated_by)`;

function values(input: ContractItemInput, actorId: string) {
  return [input.itemCode,input.groupCode,input.groupName,input.serviceDescription,input.workContent,input.unit,input.quantity,input.workScopeId,input.completedQuantity,
    input.serviceLocation,input.completionDurationDays,input.weightPercent,input.progressPercent,input.plannedStartDate||null,input.plannedEndDate||null,
    input.actualStartDate||null,input.actualEndDate||null,input.status,input.progressNote,input.acceptanceStatus,actorId];
}

export class PostgresContractItemRepository {
  constructor(private readonly client: PoolClient) {}

  async list(contractId: string) {
    const result = await this.client.query("SELECT * FROM tcms.contract_items WHERE contract_id=$1 AND archived_at IS NULL ORDER BY sequence_number", [contractId]);
    return result.rows.map((row) => mapRow(row as ItemRow));
  }

  async findById(contractId: string, itemId: string) {
    const row = (await this.client.query("SELECT * FROM tcms.contract_items WHERE contract_id=$1 AND id=$2 AND archived_at IS NULL", [contractId,itemId])).rows[0];
    return row ? mapRow(row as ItemRow) : null;
  }

  async create(contractId: string, input: ContractItemInput, actorId: string) {
    const result = await this.client.query(`INSERT INTO tcms.contract_items ${columns}
      SELECT $1,COALESCE(MAX(sequence_number),0)+1,$2,$3,$4,$5,'SERVICE',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22
      FROM tcms.contract_items WHERE contract_id=$1 RETURNING *`, [contractId,...values(input,actorId)]);
    return mapRow(result.rows[0] as ItemRow);
  }

  async update(contractId: string, itemId: string, expectedVersion: number, input: ContractItemInput, actorId: string) {
    const result = await this.client.query(`UPDATE tcms.contract_items SET item_code=$1,group_code=$2,group_name=$3,item_name=$4,description=$5,
      unit=$6,contract_quantity=$7,work_scope_id=$8,completed_quantity=$9,service_location=$10,completion_duration_days=$11,weight_percent=$12,
      progress_percent=$13,planned_start_date=$14,planned_end_date=$15,actual_start_date=$16,actual_end_date=$17,status=$18,
      progress_note=$19,acceptance_status=$20,updated_by=$21 WHERE contract_id=$22 AND id=$23 AND version=$24 RETURNING *`,
      [...values(input,actorId),contractId,itemId,expectedVersion]);
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    return mapRow(result.rows[0] as ItemRow);
  }

  async createChecklistItems(itemId: string, descriptions: readonly string[], actorId: string) {
    const created: ContractItemChecklistItem[] = [];
    for (const [index, description] of descriptions.entries()) {
      const result = await this.client.query(
        `INSERT INTO tcms.contract_item_checklist_items
          (contract_item_id,sequence_number,description,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$4) RETURNING *`,
        [itemId, index + 1, description, actorId],
      );
      created.push(mapChecklistRow(result.rows[0] as Record<string, unknown>));
    }
    return created;
  }

  async getTracking(contractId: string, itemId: string): Promise<ContractItemTracking | null> {
    const exists = await this.findById(contractId, itemId);
    if (!exists) return null;
    const [checklistResult, logsResult] = await Promise.all([
      this.client.query(
        "SELECT * FROM tcms.contract_item_checklist_items WHERE contract_item_id=$1 ORDER BY sequence_number",
        [itemId],
      ),
      this.client.query(
        "SELECT * FROM tcms.contract_item_daily_logs WHERE contract_item_id=$1 ORDER BY log_date DESC,created_at DESC",
        [itemId],
      ),
    ]);
    const checklistItems = checklistResult.rows.map((row) => mapChecklistRow(row as Record<string, unknown>));
    const completed = checklistItems.filter((item) => item.isCompleted).length;
    return {
      checklistItems,
      dailyLogs: logsResult.rows.map((row) => mapDailyLogRow(row as Record<string, unknown>)),
      checklistCompletionPercent: checklistItems.length ? (completed / checklistItems.length) * 100 : null,
    };
  }

  async updateChecklistCompletion(
    contractId: string,
    itemId: string,
    checklistItemId: string,
    expectedVersion: number,
    isCompleted: boolean,
    actorId: string,
  ) {
    const result = await this.client.query(
      `UPDATE tcms.contract_item_checklist_items checklist
       SET is_completed=$1,completed_at=CASE WHEN $1 THEN clock_timestamp() ELSE NULL END,
           completed_by=CASE WHEN $1 THEN $2 ELSE NULL END,updated_by=$2
       WHERE checklist.id=$3 AND checklist.contract_item_id=$4 AND checklist.version=$5
         AND EXISTS (SELECT 1 FROM tcms.contract_items item WHERE item.id=$4 AND item.contract_id=$6 AND item.archived_at IS NULL)
       RETURNING checklist.*`,
      [isCompleted, actorId, checklistItemId, itemId, expectedVersion, contractId],
    );
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    return mapChecklistRow(result.rows[0] as Record<string, unknown>);
  }

  async appendDailyLog(contractId: string, itemId: string, logDate: string, note: string, actorId: string) {
    const result = await this.client.query(
      `INSERT INTO tcms.contract_item_daily_logs (contract_item_id,log_date,note,created_by)
       SELECT item.id,$1,$2,$3 FROM tcms.contract_items item
       WHERE item.id=$4 AND item.contract_id=$5 AND item.archived_at IS NULL RETURNING *`,
      [logDate, note, actorId, itemId, contractId],
    );
    if (!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND");
    return mapDailyLogRow(result.rows[0] as Record<string, unknown>);
  }
}
