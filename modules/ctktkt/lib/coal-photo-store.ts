import { getRawDb } from "../db/index";
import { coalPhotoExpiry } from "./coal-photo-retention";
export async function coalPhotoDb() {
  const db=getRawDb();
  await db.prepare("DELETE FROM coal_meter_photos WHERE expires_at <= ?").bind(Date.now()).run();
  return db;
}
export async function reserveCoalPhotoRead(owner:string) {
  const db=await coalPhotoDb(),bucket=Math.floor(Date.now()/3600000);
  await db.prepare("DELETE FROM coal_photo_usage WHERE bucket < ?").bind(bucket-24).run();
  const result=await db.prepare("INSERT INTO coal_photo_usage(owner_id,bucket,requests) VALUES(?,?,1) ON CONFLICT(owner_id,bucket) DO UPDATE SET requests=requests+1 WHERE requests<72 RETURNING requests").bind(owner,bucket).all();
  return result.results.length===1;
}
export async function saveCoalPhoto(owner:string,date:string,slot:string,type:string,data:string,reading:unknown) {
  const expires=coalPhotoExpiry(date,slot);
  if(expires<=Date.now()) return null;
  if(expires>Date.now()+40*3600000) throw new Error("Không lưu ảnh cho ca tương lai.");
  const db=await coalPhotoDb(),id=crypto.randomUUID();
  const result=await db.prepare("INSERT INTO coal_meter_photos (id,owner_id,report_date,slot,type,data,reading,expires_at,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(length(data)),0) FROM coal_meter_photos) + ? <= 40000000").bind(id,owner,date,slot,type,data,JSON.stringify(reading),expires,Date.now(),data.length).run();
  if(result.meta.changes!==1) throw new Error("Kho ảnh tạm đầy. Chưa lưu ảnh; hãy thử lại sau.");
  return {id,expiresAt:expires};
}
