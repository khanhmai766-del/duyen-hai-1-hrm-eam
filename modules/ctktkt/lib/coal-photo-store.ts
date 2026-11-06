import { getRawDb } from "../db/index";
export async function coalPhotoDb() {
  const db=getRawDb();
  await db.prepare("DELETE FROM coal_meter_photos WHERE expires_at <= ?").bind(Date.now()).run();
  return db;
}
export async function reserveCoalPhotoRead(owner:string) {
  const db=await coalPhotoDb(),bucket=Math.floor(Date.now()/3600000);
  await db.prepare("DELETE FROM coal_photo_usage WHERE bucket < ?").bind(bucket-24).run();
  const result=await db.prepare("INSERT INTO coal_photo_usage AS usage(owner_id,bucket,requests) VALUES(?,?,1) ON CONFLICT(owner_id,bucket) DO UPDATE SET requests=usage.requests+1 WHERE usage.requests<72 RETURNING usage.requests").bind(owner,bucket).all();
  return result.results.length===1;
}
