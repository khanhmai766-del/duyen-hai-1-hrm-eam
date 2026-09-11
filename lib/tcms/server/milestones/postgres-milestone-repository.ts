import "server-only";
import type {PoolClient} from "pg";
import type {Milestone,MilestoneInput,MilestoneOptions,MilestoneSummary} from "../../types/milestone";

const optional=(value:unknown)=>value===null?undefined:String(value);
function date(value:unknown){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);}
function mapMilestone(row:Record<string,unknown>):Milestone{return {
  id:String(row.id),contractId:String(row.contract_id),contractNumber:String(row.contract_number),packageName:String(row.package_name),
  workScopeId:optional(row.work_scope_id),workScopeCode:optional(row.work_scope_code),workScopeName:optional(row.work_scope_name),
  contractItemId:optional(row.contract_item_id),contractItemCode:optional(row.contract_item_code),contractItemName:optional(row.contract_item_name),
  ownerUserId:optional(row.owner_user_id),ownerDisplayName:optional(row.owner_display_name),code:String(row.code),name:String(row.name),description:optional(row.description),
  plannedDate:date(row.planned_date),forecastDate:row.forecast_date?date(row.forecast_date):undefined,actualDate:row.actual_date?date(row.actual_date):undefined,
  progressPercent:Number(row.progress_percent),status:row.status as Milestone["status"],critical:Boolean(row.critical),notes:optional(row.notes),
  delayDays:Number(row.delay_days),version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
};}

const selectMilestones=`SELECT m.*,c.contract_number,c.package_name,w.code work_scope_code,w.name work_scope_name,
  i.item_code contract_item_code,i.item_name contract_item_name,u.display_name owner_display_name,
  GREATEST(0,(COALESCE(m.actual_date,m.forecast_date,CASE WHEN m.status NOT IN ('COMPLETED','CANCELLED') THEN current_date END,m.planned_date)-m.planned_date))::int delay_days
  FROM tcms.milestones m JOIN tcms.contracts c ON c.id=m.contract_id
  LEFT JOIN tcms.work_scopes w ON w.id=m.work_scope_id LEFT JOIN tcms.contract_items i ON i.id=m.contract_item_id
  LEFT JOIN tcms.app_users u ON u.id=m.owner_user_id WHERE m.archived_at IS NULL`;

function mapDatabaseError(error:unknown):never{if(typeof error==="object"&&error!==null&&"code" in error){if(error.code==="23505")throw new Error("MILESTONE_CODE_CONFLICT");if(error.code==="23503")throw new Error("MILESTONE_REFERENCE_NOT_FOUND");if(error.code==="23514")throw new SyntaxError("INVALID_MILESTONE_FIELDS");}throw error;}

export class PostgresMilestoneRepository{
  constructor(private readonly client:PoolClient){}
  async list(){const result=await this.client.query(`${selectMilestones} ORDER BY m.planned_date,m.code`);return result.rows.map((row)=>mapMilestone(row));}
  async findById(id:string){const result=await this.client.query(`${selectMilestones} AND m.id=$1`,[id]);return result.rowCount?mapMilestone(result.rows[0]):null;}
  async summary():Promise<MilestoneSummary>{const result=await this.client.query(`SELECT count(*)::int total,count(*) FILTER(WHERE status='COMPLETED')::int completed,
    count(*) FILTER(WHERE status='DELAYED' OR (status NOT IN ('COMPLETED','CANCELLED') AND planned_date<current_date))::int delayed,
    count(*) FILTER(WHERE status='AT_RISK')::int at_risk,count(*) FILTER(WHERE critical AND status NOT IN ('COMPLETED','CANCELLED'))::int critical_open
    FROM tcms.milestones WHERE archived_at IS NULL`);const row=result.rows[0];return {total:Number(row.total),completed:Number(row.completed),delayed:Number(row.delayed),atRisk:Number(row.at_risk),criticalOpen:Number(row.critical_open)};}
  async options():Promise<MilestoneOptions>{
    const contracts=await this.client.query("SELECT id::text,contract_number,package_name FROM tcms.contracts WHERE archived_at IS NULL ORDER BY contract_number");
    const scopes=await this.client.query("SELECT id::text,contract_id::text,code,name FROM tcms.work_scopes ORDER BY contract_id,parent_scope_id NULLS FIRST,sequence");
    const items=await this.client.query("SELECT id::text,contract_id::text,work_scope_id::text,item_code,item_name FROM tcms.contract_items WHERE archived_at IS NULL ORDER BY contract_id,sequence_number");
    const personnel=await this.client.query("SELECT u.id::text,u.display_name,d.code department_code FROM tcms.app_users u LEFT JOIN tcms.departments d ON d.id=u.primary_department_id WHERE u.active ORDER BY u.display_name");
    return {contracts:contracts.rows.map((row)=>({id:String(row.id),contractNumber:String(row.contract_number),packageName:String(row.package_name)})),workScopes:scopes.rows.map((row)=>({id:String(row.id),contractId:String(row.contract_id),code:optional(row.code),name:String(row.name)})),contractItems:items.rows.map((row)=>({id:String(row.id),contractId:String(row.contract_id),workScopeId:optional(row.work_scope_id),itemCode:optional(row.item_code),name:String(row.item_name)})),personnel:personnel.rows.map((row)=>({id:String(row.id),displayName:String(row.display_name),departmentCode:optional(row.department_code)}))};
  }
  async create(input:MilestoneInput,actorId:string){try{await this.ensureOwnerAvailable(input.ownerUserId);const result=await this.client.query(`INSERT INTO tcms.milestones
    (contract_id,work_scope_id,contract_item_id,owner_user_id,code,name,description,planned_date,forecast_date,actual_date,progress_percent,status,critical,notes,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id::text`,[input.contractId,input.workScopeId,input.contractItemId,input.ownerUserId,input.code,input.name,input.description,input.plannedDate,input.forecastDate,input.actualDate,input.progressPercent,input.status,input.critical,input.notes,actorId]);return (await this.findById(String(result.rows[0].id)))!;}catch(error){return mapDatabaseError(error);}}
  async update(id:string,expectedVersion:number,input:MilestoneInput,actorId:string){try{await this.ensureOwnerAvailable(input.ownerUserId);const result=await this.client.query(`UPDATE tcms.milestones SET contract_id=$1,work_scope_id=$2,contract_item_id=$3,owner_user_id=$4,code=$5,name=$6,description=$7,planned_date=$8,forecast_date=$9,actual_date=$10,progress_percent=$11,status=$12,critical=$13,notes=$14,updated_by=$15 WHERE id=$16 AND version=$17 RETURNING id`,[input.contractId,input.workScopeId,input.contractItemId,input.ownerUserId,input.code,input.name,input.description,input.plannedDate,input.forecastDate,input.actualDate,input.progressPercent,input.status,input.critical,input.notes,actorId,id,expectedVersion]);if(!result.rowCount)throw new Error("MILESTONE_CONCURRENT_UPDATE_OR_NOT_FOUND");return (await this.findById(id))!;}catch(error){return mapDatabaseError(error);}}
  private async ensureOwnerAvailable(ownerUserId?:string){if(!ownerUserId)return;const result=await this.client.query("SELECT 1 FROM tcms.app_users WHERE id=$1 AND active",[ownerUserId]);if(!result.rowCount)throw new Error("MILESTONE_OWNER_NOT_AVAILABLE");}
}
