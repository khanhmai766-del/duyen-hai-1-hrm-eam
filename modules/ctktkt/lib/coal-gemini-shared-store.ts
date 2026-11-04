import {sealCoalGeminiKey,openCoalGeminiKey} from "./coal-gemini-secret";
type Db=ReturnType<typeof import("../db/index").getRawDb>;
const name="coal-meter";
export class SharedGeminiConflict extends Error {}
export async function ensureSharedGemini(_db:Db) { /* prisma/manual/add-ctktkt.sql */ }
export async function sharedGeminiStatus(db:Db) {
  await ensureSharedGemini(db);
  const row=await db.prepare("SELECT model,version,updated_at,updated_by,cipher IS NOT NULL AS configured FROM coal_gemini_settings WHERE name=?").bind(name).first();
  return {configured:Boolean(row?.configured),model:row?String(row.model):null,version:row?Number(row.version):0,updatedAt:row?.updated_at?String(row.updated_at):null,updatedBy:row?.updated_by?String(row.updated_by):null};
}
export async function loadSharedGemini(db:Db,secret:string|undefined) {
  await ensureSharedGemini(db);
  const row=await db.prepare("SELECT cipher,model FROM coal_gemini_settings WHERE name=?").bind(name).first();
  if(!row?.cipher) return null;
  return {key:openCoalGeminiKey(String(row.cipher),secret),model:String(row.model)};
}
export async function saveSharedGemini(db:Db,secret:string|undefined,input:{key:string;model:string;expectedVersion:number;actorId:string;actorName:string}) {
  // Encrypt before any write. Neither table contains plaintext keys or photo data.
  const cipher=sealCoalGeminiKey(input.key,secret),id=crypto.randomUUID(),now=new Date().toISOString();
  await ensureSharedGemini(db);
  const result=await db.batch([
    db.prepare("INSERT OR IGNORE INTO coal_gemini_settings(name,cipher,model,version,operation) VALUES(?,NULL,'',0,'')").bind(name),
    db.prepare("UPDATE coal_gemini_settings SET cipher=?,model=?,version=version+1,updated_at=?,updated_by=?,operation=? WHERE name=? AND version=?").bind(cipher,input.model,now,input.actorName,id,name,input.expectedVersion),
    db.prepare("INSERT INTO coal_gemini_settings_events(id,version,actor_id,actor_name,action,created_at) SELECT ?,version,?,?,'replace',? FROM coal_gemini_settings WHERE name=? AND operation=?").bind(id,input.actorId,input.actorName,now,name,id),
  ]);
  if(result[1].meta.changes!==1) throw new SharedGeminiConflict("Khóa vừa được người khác thay đổi. Tải lại trạng thái rồi kiểm tra trước khi lưu.");
  return sharedGeminiStatus(db);
}

/** Update the model without decrypting, replacing or returning the saved key. */
export async function updateSharedGeminiModel(db:Db,input:{model:string;expectedVersion:number;actorId:string;actorName:string}) {
  await ensureSharedGemini(db);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const result=await db.batch([
    db.prepare("UPDATE coal_gemini_settings SET model=?,version=version+1,updated_at=?,updated_by=?,operation=? WHERE name=? AND version=? AND cipher IS NOT NULL").bind(input.model,now,input.actorName,id,name,input.expectedVersion),
    db.prepare("INSERT INTO coal_gemini_settings_events(id,version,actor_id,actor_name,action,created_at) SELECT ?,version,?,?,'model',? FROM coal_gemini_settings WHERE name=? AND operation=?").bind(id,input.actorId,input.actorName,now,name,id),
  ]);
  if(result[0].meta.changes!==1)throw new SharedGeminiConflict("Chưa có khóa chung hoặc cấu hình vừa được thay đổi. Tải lại trạng thái trước khi lưu model.");
  return sharedGeminiStatus(db);
}
