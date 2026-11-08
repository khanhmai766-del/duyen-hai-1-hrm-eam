import { getRawDb } from "../db/index";
import { deleteS3ObjectByKey, getS3ObjectBuffer, uploadS3Object } from "@/lib/s3";
import { COAL_PHOTO_FUTURE_LIMIT_MS, coalPhotoExpiry } from "./coal-photo-retention";

/** Ảnh nằm trên kho tệp Server 3 (S3); bảng ctktkt_coal_meter_photos chỉ giữ khoá ảnh và kết quả đọc. */
const KEY_PREFIX = "s3:";
const FOLDER = "ctktkt/coal-meter-photos";
const MAX_ACTIVE_PHOTOS = 600;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Db = ReturnType<typeof getRawDb>;
export type CoalPhotoStorage = {
  upload: (key: string, body: Buffer, contentType: string) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
  read: (key: string) => Promise<Buffer>;
};
export const s3CoalPhotoStorage: CoalPhotoStorage = {
  upload: (key, body, contentType) => uploadS3Object({ key, body, contentType }),
  remove: key => deleteS3ObjectByKey(key),
  read: key => getS3ObjectBuffer(key),
};

function storedKey(data: unknown) {
  const value = String(data ?? "");
  return value.startsWith(KEY_PREFIX) ? value.slice(KEY_PREFIX.length) : null;
}

/** Xoá ảnh hết hạn trên kho tệp trước, rồi mới xoá dòng; lỗi xoá tệp thì giữ dòng để lần sau xoá lại. */
export async function cleanupExpiredCoalPhotos(now = Date.now(), db: Db = getRawDb(), storage = s3CoalPhotoStorage) {
  const { results } = await db.prepare("SELECT id,data FROM coal_meter_photos WHERE expires_at <= ? LIMIT 500").bind(now).all();
  let removed = 0;
  for (const row of results) {
    const key = storedKey(row.data);
    try { if (key) await storage.remove(key); } catch { continue; }
    const result = await db.prepare("DELETE FROM coal_meter_photos WHERE id = ? AND expires_at <= ?").bind(String(row.id), now).run();
    removed += result.meta.changes || 0;
  }
  return removed;
}

export async function coalPhotoDb() {
  const db = getRawDb();
  // Dọn ảnh hết hạn mỗi lần dùng kho ảnh; lỗi kho tệp không chặn việc xem/đọc ảnh còn hạn.
  await cleanupExpiredCoalPhotos(Date.now(), db).catch(() => 0);
  return db;
}

export async function reserveCoalPhotoRead(owner:string) {
  const db=await coalPhotoDb(),bucket=Math.floor(Date.now()/3600000);
  await db.prepare("DELETE FROM coal_photo_usage WHERE bucket < ?").bind(bucket-24).run();
  const result=await db.prepare("INSERT INTO coal_photo_usage AS usage(owner_id,bucket,requests) VALUES(?,?,1) ON CONFLICT(owner_id,bucket) DO UPDATE SET requests=usage.requests+1 WHERE usage.requests<72 RETURNING usage.requests").bind(owner,bucket).all();
  return result.results.length===1;
}

export async function saveCoalPhoto(owner:string,date:string,slot:string,type:string,data:Buffer,reading:unknown,
  db: Db = getRawDb(), storage = s3CoalPhotoStorage, now = Date.now()) {
  const expires=coalPhotoExpiry(date,slot);
  if(expires<=now) return null;
  if(expires>now+COAL_PHOTO_FUTURE_LIMIT_MS) throw new Error("Không lưu ảnh cho ca tương lai.");
  const extension=EXTENSIONS[type];
  if(!extension) throw new Error("Định dạng ảnh không hợp lệ.");
  const id=crypto.randomUUID(),key=`${FOLDER}/${date}/${id}.${extension}`;
  await storage.upload(key,data,type);
  try {
    const result=await db.prepare("INSERT INTO coal_meter_photos (id,owner_id,report_date,slot,type,data,reading,expires_at,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM coal_meter_photos WHERE expires_at > ?) < ?")
      .bind(id,owner,date,slot,type,KEY_PREFIX+key,JSON.stringify(reading),expires,now,now,MAX_ACTIVE_PHOTOS).run();
    if(result.meta.changes!==1) throw new Error("Kho ảnh tạm đầy. Chưa lưu ảnh; hãy thử lại sau.");
  } catch (error) {
    await storage.remove(key).catch(() => {});
    throw error;
  }
  return {id,expiresAt:expires};
}

/** Đọc nội dung ảnh còn hạn. Dòng cũ (trước khi chuyển sang kho tệp) còn base64 thì vẫn đọc được. */
export async function readCoalPhotoBytes(data: unknown, storage = s3CoalPhotoStorage) {
  const key = storedKey(data);
  return key ? storage.read(key) : Buffer.from(String(data ?? ""), "base64");
}
