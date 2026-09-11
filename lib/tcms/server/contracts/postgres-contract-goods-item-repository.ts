import "server-only";
import type { PoolClient } from "pg";
import type { ContractGoodsItem, CreateContractGoodsItemInput } from "../../types/contract-goods-item";

function map(row: Record<string, unknown>): ContractGoodsItem {
  return { id: String(row.id), contractId: String(row.contract_id), workScopeId: row.work_scope_id ? String(row.work_scope_id) : undefined,
    sequence: Number(row.sequence), itemCode: row.item_code ? String(row.item_code) : undefined, description: String(row.description),
    technicalSpecification: row.technical_specification ? String(row.technical_specification) : undefined, manufacturer: row.manufacturer ? String(row.manufacturer) : undefined,
    model: row.model ? String(row.model) : undefined, origin: row.origin ? String(row.origin) : undefined, quantity: row.quantity === null ? undefined : Number(row.quantity),
    unit: row.unit ? String(row.unit) : undefined, documentRequirementText: row.document_requirement_text ? String(row.document_requirement_text) : undefined,
    rawClause: row.raw_clause ? String(row.raw_clause) : undefined, sourcePage: row.source_page === null ? undefined : Number(row.source_page),
    evidence: row.evidence ? String(row.evidence) : undefined, confidence: row.confidence === null ? undefined : Number(row.confidence), version: Number(row.version) };
}
function values(input: CreateContractGoodsItemInput, actorId: string) { return [input.workScopeId ?? null,input.itemCode ?? null,input.description,input.technicalSpecification ?? null,input.manufacturer ?? null,input.model ?? null,input.origin ?? null,input.quantity ?? null,input.unit ?? null,input.documentRequirementText ?? null,input.rawClause ?? null,input.sourcePage ?? null,input.evidence ?? null,input.confidence ?? null,actorId]; }
export class PostgresContractGoodsItemRepository {
  constructor(private readonly client: PoolClient) {}
  async list(contractId: string) { const result=await this.client.query("SELECT * FROM tcms.contract_goods_items WHERE contract_id=$1 ORDER BY work_scope_id NULLS FIRST, sequence",[contractId]); return result.rows.map(map); }
  async findById(contractId: string,id: string) { const result=await this.client.query("SELECT * FROM tcms.contract_goods_items WHERE contract_id=$1 AND id=$2",[contractId,id]); return result.rows[0] ? map(result.rows[0]) : null; }
  async create(contractId: string,input: CreateContractGoodsItemInput,actorId: string) { const result=await this.client.query(`INSERT INTO tcms.contract_goods_items (contract_id,work_scope_id,sequence,item_code,description,technical_specification,manufacturer,model,origin,quantity,unit,document_requirement_text,raw_clause,source_page,evidence,confidence,created_by,updated_by)
    SELECT $1,$2,COALESCE(MAX(sequence),0)+1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16 FROM tcms.contract_goods_items WHERE contract_id=$1 AND work_scope_id IS NOT DISTINCT FROM $2::uuid RETURNING *`,[contractId,...values(input,actorId)]); return map(result.rows[0]); }
  async update(contractId: string,id: string,version: number,input: CreateContractGoodsItemInput,actorId: string) { const result=await this.client.query(`UPDATE tcms.contract_goods_items SET work_scope_id=$1,
      sequence=CASE WHEN work_scope_id IS DISTINCT FROM $1::uuid THEN
        (SELECT COALESCE(MAX(target.sequence),0)+1 FROM tcms.contract_goods_items target WHERE target.contract_id=$16 AND target.work_scope_id IS NOT DISTINCT FROM $1::uuid)
        ELSE sequence END,
      item_code=$2,description=$3,technical_specification=$4,manufacturer=$5,model=$6,origin=$7,quantity=$8,unit=$9,document_requirement_text=$10,raw_clause=$11,source_page=$12,evidence=$13,confidence=$14,updated_by=$15 WHERE contract_id=$16 AND id=$17 AND version=$18 RETURNING *`,[...values(input,actorId),contractId,id,version]); if(!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND"); return map(result.rows[0]); }
  async delete(contractId: string,id: string,version: number) { const result=await this.client.query("DELETE FROM tcms.contract_goods_items WHERE contract_id=$1 AND id=$2 AND version=$3",[contractId,id,version]); if(!result.rowCount) throw new Error("CONCURRENT_UPDATE_OR_NOT_FOUND"); }
}
