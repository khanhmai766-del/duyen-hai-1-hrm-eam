import { prisma } from "@/lib/prisma";
import { deleteS3ObjectByKey, getS3ObjectBuffer, uploadS3Object } from "@/lib/s3";
import { COAL_PHOTO_FUTURE_LIMIT_MS, coalPhotoExpiry } from "./coal-photo-retention";

/** Ảnh nằm trên kho tệp Server 3 (S3); bảng ctktkt_coal_meter_photos chỉ giữ khoá ảnh và kết quả đọc. */
const KEY_PREFIX = "s3:";
const FOLDER = "ctktkt/coal-meter-photos";
const MAX_ACTIVE_PHOTOS = 600;
const MAX_READS_PER_HOUR = 72;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Kho dữ liệu (giai đoạn 3: Prisma). Cột expires_at/created_at là BIGINT (mili giây) → Prisma dùng bigint. */
type Db = typeof prisma;
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

/** Xoá ảnh hết hạn trên kho tệp trước, rồi mới xoá dòng; lỗi xoá tệp thì giữ dòng để lần sau xoá lại. Tối đa 500 ảnh/lượt. */
export async function cleanupExpiredCoalPhotos(now = Date.now(), db: Db = prisma, storage = s3CoalPhotoStorage) {
  const results = await db.ctktktCoalMeterPhotos.findMany({ where: { expires_at: { lte: BigInt(now) } }, select: { id: true, data: true }, take: 500 });
  let removed = 0;
  for (const row of results) {
    const key = storedKey(row.data);
    try { if (key) await storage.remove(key); } catch { continue; }
    const result = await db.ctktktCoalMeterPhotos.deleteMany({ where: { id: String(row.id), expires_at: { lte: BigInt(now) } } });
    removed += result.count;
  }
  return removed;
}

export async function coalPhotoDb() {
  // Dọn ảnh hết hạn mỗi lần dùng kho ảnh; lỗi kho tệp không chặn việc xem/đọc ảnh còn hạn.
  await cleanupExpiredCoalPhotos(Date.now(), prisma).catch(() => 0);
  return prisma;
}

/**
 * Giữ một lượt đọc ảnh/kiểm tra Gemini (tối đa 72 lượt/giờ/người). Tăng đếm và chặn khi đủ trong MỘT câu lệnh
 * (`INSERT … ON CONFLICT … DO UPDATE … WHERE requests < 72 RETURNING`) để nhiều lượt cùng lúc không vượt hạn mức —
 * Prisma không có API cho upsert có điều kiện nên câu này viết qua `$queryRaw` (tham số vẫn được Prisma gắn an toàn).
 */
export async function reserveCoalPhotoRead(owner:string) {
  const db=await coalPhotoDb(),bucket=Math.floor(Date.now()/3600000);
  await db.ctktktCoalPhotoUsage.deleteMany({ where: { bucket: { lt: bucket-24 } } });
  const result=await db.$queryRaw<Array<{requests:number}>>`INSERT INTO public.ctktkt_coal_photo_usage AS usage(owner_id,bucket,requests) VALUES(${owner},${bucket}::integer,1) ON CONFLICT(owner_id,bucket) DO UPDATE SET requests=usage.requests+1 WHERE usage.requests<${MAX_READS_PER_HOUR} RETURNING usage.requests`;
  return result.length===1;
}

export async function saveCoalPhoto(owner:string,date:string,slot:string,type:string,data:Buffer,reading:unknown,
  db: Db = prisma, storage = s3CoalPhotoStorage, now = Date.now()) {
  const expires=coalPhotoExpiry(date,slot);
  if(expires<=now) return null;
  if(expires>now+COAL_PHOTO_FUTURE_LIMIT_MS) throw new Error("Không lưu ảnh cho ca tương lai.");
  const extension=EXTENSIONS[type];
  if(!extension) throw new Error("Định dạng ảnh không hợp lệ.");
  const id=crypto.randomUUID(),key=`${FOLDER}/${date}/${id}.${extension}`;
  await storage.upload(key,data,type);
  try {
    // Chỉ thêm khi kho còn dưới 600 ảnh còn hạn (đếm + thêm cùng giao dịch).
    const inserted=await db.$transaction(async tx=>{
      if(await tx.ctktktCoalMeterPhotos.count({ where: { expires_at: { gt: BigInt(now) } } })>=MAX_ACTIVE_PHOTOS) return false;
      await tx.ctktktCoalMeterPhotos.create({ data: { id, owner_id: owner, report_date: date, slot, type, data: KEY_PREFIX+key, reading: JSON.stringify(reading), expires_at: BigInt(expires), created_at: BigInt(now) } });
      return true;
    });
    if(!inserted) throw new Error("Kho ảnh tạm đầy. Chưa lưu ảnh; hãy thử lại sau.");
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
