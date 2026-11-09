import {prisma} from "@/lib/prisma";
import {sealCoalGeminiKey,openCoalGeminiKey} from "./coal-gemini-secret";
/** Khoá Gemini dùng chung (giai đoạn 3: Prisma). Bảng chỉ giữ khoá đã mã hoá; nhật ký thay đổi không có khoá. */
type Db=typeof prisma;
const name="coal-meter";
export class SharedGeminiConflict extends Error {}
export async function ensureSharedGemini(_db:Db) { /* prisma/manual/add-ctktkt.sql */ }
export async function sharedGeminiStatus(db:Db) {
  await ensureSharedGemini(db);
  const row=await db.ctktktCoalGeminiSettings.findUnique({where:{name},select:{model:true,version:true,updated_at:true,updated_by:true,cipher:true}});
  return {configured:row?.cipher!=null,model:row?String(row.model):null,version:row?Number(row.version):0,updatedAt:row?.updated_at?String(row.updated_at):null,updatedBy:row?.updated_by?String(row.updated_by):null};
}
export async function loadSharedGemini(db:Db,secret:string|undefined) {
  await ensureSharedGemini(db);
  const row=await db.ctktktCoalGeminiSettings.findUnique({where:{name},select:{cipher:true,model:true}});
  if(!row?.cipher) return null;
  return {key:openCoalGeminiKey(String(row.cipher),secret),model:String(row.model)};
}
/** Sau khi đổi cấu hình (operation = id lượt đổi): ghi nhật ký với phiên bản mới — như INSERT … SELECT version … WHERE operation = ? cũ. */
async function logEvent(tx:Parameters<Parameters<Db["$transaction"]>[0]>[0],id:string,action:"replace"|"model",input:{actorId:string;actorName:string},now:string){
  const row=await tx.ctktktCoalGeminiSettings.findFirst({where:{name,operation:id},select:{version:true}});
  if(row)await tx.ctktktCoalGeminiSettingsEvents.create({data:{id,version:row.version,actor_id:input.actorId,actor_name:input.actorName,action,created_at:now}});
}
export async function saveSharedGemini(db:Db,secret:string|undefined,input:{key:string;model:string;expectedVersion:number;actorId:string;actorName:string}) {
  // Encrypt before any write. Neither table contains plaintext keys or photo data.
  const cipher=sealCoalGeminiKey(input.key,secret),id=crypto.randomUUID(),now=new Date().toISOString();
  await ensureSharedGemini(db);
  // Như bản cũ: dòng cấu hình rỗng được tạo (và giữ lại) ngay cả khi lượt lưu xung đột phiên bản.
  const changed=await db.$transaction(async tx=>{
    await tx.ctktktCoalGeminiSettings.createMany({data:[{name,cipher:null,model:"",version:0,operation:""}],skipDuplicates:true});
    const result=await tx.ctktktCoalGeminiSettings.updateMany({where:{name,version:input.expectedVersion},data:{cipher,model:input.model,version:{increment:1},updated_at:now,updated_by:input.actorName,operation:id}});
    await logEvent(tx,id,"replace",input,now);
    return result.count;
  });
  if(changed!==1) throw new SharedGeminiConflict("Khóa vừa được người khác thay đổi. Tải lại trạng thái rồi kiểm tra trước khi lưu.");
  return sharedGeminiStatus(db);
}

/** Update the model without decrypting, replacing or returning the saved key. */
export async function updateSharedGeminiModel(db:Db,input:{model:string;expectedVersion:number;actorId:string;actorName:string}) {
  await ensureSharedGemini(db);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const changed=await db.$transaction(async tx=>{
    const result=await tx.ctktktCoalGeminiSettings.updateMany({where:{name,version:input.expectedVersion,cipher:{not:null}},data:{model:input.model,version:{increment:1},updated_at:now,updated_by:input.actorName,operation:id}});
    await logEvent(tx,id,"model",input,now);
    return result.count;
  });
  if(changed!==1)throw new SharedGeminiConflict("Chưa có khóa chung hoặc cấu hình vừa được thay đổi. Tải lại trạng thái trước khi lưu model.");
  return sharedGeminiStatus(db);
}
