import {isShiftInputCoordinator} from "./auth/delegation-policy";
import {canProposeCtktktCorrection} from "./ctktkt-permissions";
import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {getPool} from "../db";
import type {SessionUser} from "./auth/session";
import {canSelfCorrect,inputShiftStart} from "./input-shift";
import {canEditCtktktField} from "./ctktkt-permissions";
type Entry={cell:string;value:string};
type Snapshot=Entry & {oldValue:string|null;oldNote:string|null;oldUpdatedAt:string|null;auditId:string};
export class CorrectionError extends Error {constructor(message:string,public status=409){super(message);}}
async function snapshot(c:PoolClient,date:string,entry:Entry):Promise<Snapshot> {
 const code='KTKT:'+entry.cell;
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[date+':'+code]);
 const {rows}=await c.query('SELECT value,note,updated_at FROM public.ctktkt_daily_inputs WHERE operating_date=$1 AND field_code=$2 FOR UPDATE',[date,code]);
 const audit=await c.query('SELECT id FROM public.ctktkt_daily_input_audit WHERE operating_date=$1 AND field_code=$2 ORDER BY id DESC LIMIT 1',[date,code]);
 return {...entry,oldValue:rows[0]?.value??null,oldNote:rows[0]?.note??null,oldUpdatedAt:rows[0]?.updated_at??null,auditId:String(audit.rows[0]?.id??'0')};
}
async function ownership(c:PoolClient,date:string,cell:string) {
 const code='KTKT:'+cell;
 let result=await c.query('SELECT owner_id,shift_start FROM public.ctktkt_input_ownership WHERE operating_date=$1 AND field_code=$2',[date,code]);
 if(!result.rowCount){
 const original=await c.query('SELECT actor_id,action,source,changed_at FROM public.ctktkt_daily_input_audit WHERE operating_date=$1 AND field_code=$2 ORDER BY id ASC LIMIT 1',[date,code]);
 const first=original.rows[0];
 if(first?.action==='insert'&&first.source==='ctktkt-report'){
 const instant=new Date(String(first.changed_at).replace(' ','T')+'Z');
 if(Number.isFinite(instant.getTime())){
 await c.query('INSERT INTO public.ctktkt_input_ownership(operating_date,field_code,owner_id,shift_start) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[date,code,first.actor_id,inputShiftStart(instant)]);
 result=await c.query('SELECT owner_id,shift_start FROM public.ctktkt_input_ownership WHERE operating_date=$1 AND field_code=$2',[date,code]);
 }
 }
 }
 return result;
}
async function persist(c:PoolClient,date:string,entries:Snapshot[],user:SessionUser,source:string) {
 for(const e of entries){const code='KTKT:'+e.cell;await c.query('INSERT INTO public.ctktkt_daily_input_audit(actor_id,actor_username,actor_name,source,operating_date,field_code,action,old_value,new_value,old_note,new_note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[user.id,user.username,user.displayName,source,date,code,e.value===''?'delete':e.oldValue===null?'insert':'update',e.oldValue,e.value||null,e.oldNote,e.value===''?null:e.oldNote??'']);
 if(e.value==='')await c.query('DELETE FROM public.ctktkt_daily_inputs WHERE operating_date=$1 AND field_code=$2',[date,code]);
 else await c.query("INSERT INTO public.ctktkt_daily_inputs(operating_date,field_code,value,note,updated_at) VALUES($1,$2,$3,'',to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')) ON CONFLICT(operating_date,field_code) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[date,code,e.value]);
 }
 for(const key of ['daily_inputs','daily_inputs:all','daily_inputs:'+date.slice(0,7)])await c.query('INSERT INTO public.ctktkt_operational_read_versions(cache_key,version) VALUES($1,1) ON CONFLICT(cache_key) DO UPDATE SET version=ctktkt_operational_read_versions.version+1',[key]);
}
async function inTransaction<T>(run:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await getPool().connect();try{await c.query('BEGIN');const value=await run(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');if((e as {code?:string}).code==='42P01')throw new CorrectionError('Chưa cài bảng kiểm soát ca và yêu cầu chỉnh sửa. Nhờ quản trị triển khai bảng dữ liệu trước.',503);throw e;}finally{c.release();}}
export async function saveReportWithShift(user:SessionUser,date:string,entries:Entry[],reason?:string,now=new Date()) {
 return inTransaction(async c=>{
 const edits:Snapshot[]=[];
 for(const e of [...entries].sort((a,b)=>a.cell.localeCompare(b.cell))){const before=await snapshot(c,date,e);if((before.oldValue??'')!==e.value)edits.push(before);}
 if(!edits.length)return {saved:0};
 if(reason){
 if(user.role==='admin')throw new CorrectionError('Quản trị có thể sửa trực tiếp, không cần gửi yêu cầu.',400);
 if(edits.some(e=>!canProposeCtktktCorrection(user,e.cell)))throw new CorrectionError("Không có quyền đề xuất sửa ô này.",403);
 if(reason.trim().length<5||reason.length>1000)throw new CorrectionError('Nhập lý do từ 5 đến 1000 ký tự.',400);
 for(const e of edits){const owner=await ownership(c,date,e.cell);if(!isShiftInputCoordinator(user)&&owner.rows[0]&&owner.rows[0].owner_id!==user.id)throw new CorrectionError('Chỉ được yêu cầu sửa số liệu do chính mình nhập.',403);if(!owner.rowCount){const original=await c.query("SELECT actor_id,action FROM public.ctktkt_daily_input_audit WHERE operating_date=$1 AND field_code=$2 ORDER BY id ASC LIMIT 1",[date,'KTKT:'+e.cell]);if(!isShiftInputCoordinator(user)&&original.rows[0]?.action==='insert'&&original.rows[0].actor_id!==user.id)throw new CorrectionError('Nhật ký xác định số liệu do tài khoản khác nhập. Chưa gửi yêu cầu.',403);}if(e.oldValue===null&&!owner.rowCount)throw new CorrectionError('Yêu cầu chỉnh sửa chỉ áp dụng cho số liệu đã nhập; ô chưa có số liệu cần quản trị bổ sung.',400);}
 const id=randomUUID();await c.query('INSERT INTO public.ctktkt_correction_requests(id,operating_date,requester_id,requester_name,reason,entries) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[id,date,user.id,user.displayName,reason.trim(),JSON.stringify(edits)]);return {requested:true,requestId:id,saved:0};
 }
 for(const e of edits){const owner=await ownership(c,date,e.cell);if(user.role!=='admin'&&(e.oldValue!==null||owner.rowCount)&&!canSelfCorrect(owner.rows[0]?.owner_id??null,owner.rows[0]?.shift_start??null,user.id,now))throw new CorrectionError('Đã hết ca, số liệu không thuộc bạn hoặc chưa xác định người nhập cũ. Chưa lưu. Mở “Yêu cầu chỉnh sửa” để gửi quản trị duyệt.');}
 await persist(c,date,edits,user,'ctktkt-report');
 for(const e of edits)await c.query('INSERT INTO public.ctktkt_input_ownership(operating_date,field_code,owner_id,shift_start) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[date,'KTKT:'+e.cell,user.id,inputShiftStart(now)]);
 return {saved:edits.filter(e=>e.value!=='').length};
 });
}
export async function listCorrections(user:SessionUser){return inTransaction(async c=>(await c.query('SELECT id,operating_date AS "operatingDate",requester_name AS "requesterName",reason,entries,status,created_at AS "createdAt",reviewer_name AS "reviewerName",review_note AS "reviewNote" FROM public.ctktkt_correction_requests WHERE ($1::boolean OR requester_id=$2) ORDER BY (status=\'pending\') DESC,created_at DESC LIMIT 100',[user.role==='admin',user.id])).rows);}
export async function reviewCorrection(user:SessionUser,id:string,approve:boolean,note:string){
 if(user.role!=='admin')throw new CorrectionError('Chỉ tài khoản quản trị được duyệt yêu cầu.',403);
 return inTransaction(async c=>{const r=await c.query('SELECT * FROM public.ctktkt_correction_requests WHERE id=$1 FOR UPDATE',[id]);const row=r.rows[0];if(!row)throw new CorrectionError('Không tìm thấy yêu cầu.',404);if(row.status!=='pending')throw new CorrectionError('Yêu cầu đã được xử lý.');
 if(approve){const entries=row.entries as Snapshot[];for(const e of entries){if(!canEditCtktktField(user,e.cell))throw new CorrectionError('Không có quyền cập nhật ô yêu cầu.',403);const current=await snapshot(c,row.operating_date,e);if(current.oldValue!==e.oldValue||current.oldNote!==e.oldNote||current.oldUpdatedAt!==e.oldUpdatedAt||current.auditId!==e.auditId)throw new CorrectionError('Số liệu đã thay đổi từ khi gửi yêu cầu. Chưa duyệt; cần kiểm tra và gửi lại.');}await persist(c,row.operating_date,entries,user,'ctktkt-correction:'+id);}
 await c.query('UPDATE public.ctktkt_correction_requests SET status=$1,reviewer_id=$2,reviewer_name=$3,reviewed_at=now(),review_note=$4 WHERE id=$5',[approve?'approved':'rejected',user.id,user.displayName,note.slice(0,1000),id]);return {ok:true};});
}
