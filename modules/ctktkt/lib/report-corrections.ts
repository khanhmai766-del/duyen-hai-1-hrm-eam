import {isShiftInputCoordinator} from "./auth/delegation-policy";
import {canProposeCtktktCorrection} from "./ctktkt-permissions";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {bumpReadVersions, ktktUtcNow, type KtktTx} from "../db/prisma";
import type {SessionUser} from "./auth/session";
import {canSelfCorrect,inputShiftStart,canFinalizeReportDate} from "./input-shift";
import {canEditCtktktField} from "./ctktkt-permissions";

/**
 * Lưu Chỉ tiêu KTKT theo ca + yêu cầu chỉnh sửa (giai đoạn 3: Prisma). Hai chỗ duy nhất còn viết SQL qua Prisma
 * (`$executeRaw`/`$queryRaw`) là KHOÁ — Prisma không có API cho chúng:
 *  - `pg_advisory_xact_lock` theo (ngày, ô): hai người lưu cùng một ô phải xếp hàng, không ghi đè nhau;
 *  - `SELECT … FOR UPDATE` dòng ô / dòng yêu cầu đang xét.
 * Mọi đọc/ghi khác dùng API Prisma, tất cả trong một giao dịch (lỗi ở đâu thì không lưu gì).
 */
type Entry={cell:string;value:string};
type Snapshot=Entry & {oldValue:string|null;oldNote:string|null;oldUpdatedAt:string|null;auditId:string};
type Ownership={owner_id:string;shift_start:Date};
export class CorrectionError extends Error {constructor(message:string,public status=409){super(message);}}

async function snapshot(tx:KtktTx,date:string,entry:Entry):Promise<Snapshot> {
 const code='KTKT:'+entry.cell;
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${date+':'+code},0))`;
 const rows=await tx.$queryRaw<Array<{value:string;note:string;updated_at:string}>>`SELECT value,note,updated_at FROM public.ctktkt_daily_inputs WHERE operating_date=${date} AND field_code=${code} FOR UPDATE`;
 const audit=await tx.ctktktDailyInputAudit.findFirst({where:{operating_date:date,field_code:code},orderBy:{id:"desc"},select:{id:true}});
 return {...entry,oldValue:rows[0]?.value??null,oldNote:rows[0]?.note??null,oldUpdatedAt:rows[0]?.updated_at??null,auditId:String(audit?.id??'0')};
}
async function findOwnership(tx:KtktTx,date:string,code:string):Promise<Ownership|null> {
 const row=await tx.ctktktInputOwnership.findUnique({where:{operatingDate_fieldCode:{operatingDate:date,fieldCode:code}},select:{ownerId:true,shiftStart:true}});
 return row?{owner_id:row.ownerId,shift_start:row.shiftStart}:null;
}
/** Chủ ô: bảng chủ ô; chưa có thì suy từ dòng nhật ký đầu tiên (thêm mới từ trang báo cáo) và ghi lại. */
async function ownership(tx:KtktTx,date:string,cell:string):Promise<Ownership|null> {
 const code='KTKT:'+cell;
 let result=await findOwnership(tx,date,code);
 if(!result){
 const first=await tx.ctktktDailyInputAudit.findFirst({where:{operating_date:date,field_code:code},orderBy:{id:"asc"},select:{actor_id:true,action:true,source:true,changed_at:true}});
 if(first?.action==='insert'&&first.source==='ctktkt-report'){
 const instant=new Date(String(first.changed_at).replace(' ','T')+'Z');
 if(Number.isFinite(instant.getTime())){
 await tx.ctktktInputOwnership.createMany({data:[{operatingDate:date,fieldCode:code,ownerId:first.actor_id,shiftStart:inputShiftStart(instant)}],skipDuplicates:true});
 result=await findOwnership(tx,date,code);
 }
 }
 }
 return result;
}
async function persist(tx:KtktTx,date:string,entries:Snapshot[],user:SessionUser,source:string) {
 const updatedAt=ktktUtcNow();
 for(const e of entries){const code='KTKT:'+e.cell;
 await tx.ctktktDailyInputAudit.create({data:{actor_id:user.id,actor_username:user.username,actor_name:user.displayName,source,operating_date:date,field_code:code,action:e.value===''?'delete':e.oldValue===null?'insert':'update',old_value:e.oldValue,new_value:e.value||null,old_note:e.oldNote,new_note:e.value===''?null:e.oldNote??''}});
 if(e.value==='')await tx.ctktktDailyInputs.deleteMany({where:{operating_date:date,field_code:code}});
 else await tx.ctktktDailyInputs.upsert({where:{operating_date_field_code:{operating_date:date,field_code:code}},create:{operating_date:date,field_code:code,value:e.value,note:'',updated_at:updatedAt},update:{value:e.value,updated_at:updatedAt}});
 }
 await bumpReadVersions(tx,['daily_inputs','daily_inputs:all','daily_inputs:'+date.slice(0,7)]);
}
async function inTransaction<T>(run:(tx:KtktTx)=>Promise<T>):Promise<T>{
 try{return await prisma.$transaction(run,{timeout:60_000,maxWait:15_000});}
 catch(e){
  // Bảng chưa cài (Postgres 42P01 / Prisma P2021).
  const code=e instanceof Prisma.PrismaClientKnownRequestError?(e.code==='P2010'?(e.meta as {code?:string}|undefined)?.code:e.code):undefined;
  if(code==='42P01'||code==='P2021')throw new CorrectionError('Chưa cài bảng kiểm soát ca và yêu cầu chỉnh sửa. Nhờ quản trị triển khai bảng dữ liệu trước.',503);
  throw e;
 }
}
export async function saveReportWithShift(user:SessionUser,date:string,entries:Entry[],reason?:string,now=new Date()) {
 return inTransaction(async tx=>{
 const edits:Snapshot[]=[];
 for(const e of [...entries].sort((a,b)=>a.cell.localeCompare(b.cell))){const before=await snapshot(tx,date,e);if((before.oldValue??'')!==e.value)edits.push(before);}
 if(!edits.length)return {saved:0};
 if(reason){
 if(user.role==='admin')throw new CorrectionError('Quản trị có thể sửa trực tiếp, không cần gửi yêu cầu.',400);
 if(edits.some(e=>!canProposeCtktktCorrection(user,e.cell)))throw new CorrectionError("Không có quyền đề xuất sửa ô này.",403);
 if(reason.trim().length<5||reason.length>1000)throw new CorrectionError('Nhập lý do từ 5 đến 1000 ký tự.',400);
 for(const e of edits){const owner=await ownership(tx,date,e.cell);if(!isShiftInputCoordinator(user)&&owner&&owner.owner_id!==user.id)throw new CorrectionError('Chỉ được yêu cầu sửa số liệu do chính mình nhập.',403);if(!owner){const original=await tx.ctktktDailyInputAudit.findFirst({where:{operating_date:date,field_code:'KTKT:'+e.cell},orderBy:{id:"asc"},select:{actor_id:true,action:true}});if(!isShiftInputCoordinator(user)&&original?.action==='insert'&&original.actor_id!==user.id)throw new CorrectionError('Nhật ký xác định số liệu do tài khoản khác nhập. Chưa gửi yêu cầu.',403);}if(e.oldValue===null&&!owner)throw new CorrectionError('Yêu cầu chỉnh sửa chỉ áp dụng cho số liệu đã nhập; ô chưa có số liệu cần quản trị bổ sung.',400);}
 const id=randomUUID();await tx.ctktktCorrectionRequest.create({data:{id,operatingDate:date,requesterId:user.id,requesterName:user.displayName,reason:reason.trim(),entries:edits as unknown as Prisma.InputJsonValue}});return {requested:true,requestId:id,saved:0};
 }
 for(const e of edits){
 const owner=await ownership(tx,date,e.cell);
 const nightFinalization=canFinalizeReportDate(date,now)&&canEditCtktktField(user,e.cell);
 if(user.role!=='admin'&&(e.oldValue!==null||owner)&&!nightFinalization&&!canSelfCorrect(owner?.owner_id??null,owner?.shift_start??null,user.id,now))throw new CorrectionError('Ngoài thời gian chốt ngày (22h–06h), chỉ được tự sửa số liệu của mình trong cùng ca. Chưa lưu. Mở “Yêu cầu chỉnh sửa” để gửi quản trị duyệt.');
 }
 await persist(tx,date,edits,user,'ctktkt-report');
 // Chủ ô: ghi khi chưa có (ON CONFLICT DO NOTHING) — chốt ngày đêm không đổi chủ ô gốc.
 await tx.ctktktInputOwnership.createMany({data:edits.map(e=>({operatingDate:date,fieldCode:'KTKT:'+e.cell,ownerId:user.id,shiftStart:inputShiftStart(now)})),skipDuplicates:true});
 return {saved:edits.filter(e=>e.value!=='').length};
 });
}
const CORRECTION_SELECT={id:true,operatingDate:true,requesterName:true,reason:true,entries:true,status:true,createdAt:true,reviewerName:true,reviewNote:true} as const;
/** Tối đa 100 yêu cầu: chờ duyệt lên trước, rồi mới nhất trước (= ORDER BY (status='pending') DESC, created_at DESC LIMIT 100). */
export async function listCorrections(user:SessionUser){return inTransaction(async tx=>{
 const scope=user.role==='admin'?{}:{requesterId:user.id};
 const pending=await tx.ctktktCorrectionRequest.findMany({where:{...scope,status:'pending'},orderBy:{createdAt:'desc'},take:100,select:CORRECTION_SELECT});
 const others=pending.length<100?await tx.ctktktCorrectionRequest.findMany({where:{...scope,NOT:{status:'pending'}},orderBy:{createdAt:'desc'},take:100-pending.length,select:CORRECTION_SELECT}):[];
 return [...pending,...others];
});}
export async function reviewCorrection(user:SessionUser,id:string,approve:boolean,note:string){
 if(user.role!=='admin')throw new CorrectionError('Chỉ tài khoản quản trị được duyệt yêu cầu.',403);
 return inTransaction(async tx=>{const rows=await tx.$queryRaw<Array<{operating_date:string;status:string;entries:unknown}>>`SELECT operating_date,status,entries FROM public.ctktkt_correction_requests WHERE id=${id} FOR UPDATE`;const row=rows[0];if(!row)throw new CorrectionError('Không tìm thấy yêu cầu.',404);if(row.status!=='pending')throw new CorrectionError('Yêu cầu đã được xử lý.');
 if(approve){const entries=row.entries as Snapshot[];for(const e of entries){if(!canEditCtktktField(user,e.cell))throw new CorrectionError('Không có quyền cập nhật ô yêu cầu.',403);const current=await snapshot(tx,row.operating_date,e);if(current.oldValue!==e.oldValue||current.oldNote!==e.oldNote||current.oldUpdatedAt!==e.oldUpdatedAt||current.auditId!==e.auditId)throw new CorrectionError('Số liệu đã thay đổi từ khi gửi yêu cầu. Chưa duyệt; cần kiểm tra và gửi lại.');}await persist(tx,row.operating_date,entries,user,'ctktkt-correction:'+id);}
 await tx.ctktktCorrectionRequest.update({where:{id},data:{status:approve?'approved':'rejected',reviewerId:user.id,reviewerName:user.displayName,reviewedAt:new Date(),reviewNote:note.slice(0,1000)}});return {ok:true};});
}
