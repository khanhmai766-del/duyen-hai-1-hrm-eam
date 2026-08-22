import sharp from "sharp";
import { uploadS3Object, deleteS3ObjectByKey, s3ProxyUrl, getS3ObjectBuffer } from "@/lib/s3";
import { vietnamDatePath } from "@/lib/material-document-name";
import { MIN_USAGE_PHOTOS } from "@/lib/constants";

/**
 * Ba ảnh hiện trường của bước "Xác nhận sử dụng vật tư".
 *
 * Ảnh chỉ sống tới lúc quyết toán: mục đích duy nhất của chúng là chèn vào BBNT
 * D-Office. Quyết toán xong thì biên bản đã có ảnh nhúng bên trong, giữ thêm bản
 * rời trên S3 chỉ tốn chỗ — xem `deleteUsagePhotos` gọi từ action "settle".
 */

export { MIN_USAGE_PHOTOS };

export const USAGE_PHOTO_SLOTS = ["before", "after", "spec"] as const;
export type UsagePhotoSlot = (typeof USAGE_PHOTO_SLOTS)[number];

/** Nhãn hiển thị và chú thích, dùng chung cho giao diện lẫn thông báo lỗi. */
export const USAGE_PHOTO_LABELS: Record<UsagePhotoSlot, { title: string; hint: string }> = {
  before: { title: "Hình 1", hint: "Thiết bị TRƯỚC khi thay thế / bổ sung vật tư" },
  after: { title: "Hình 2", hint: "Thiết bị SAU khi thay thế / bổ sung vật tư" },
  // Nhắc cách chụp ngay tại đây: đo trên ảnh nhãn thông số cho thấy chụp từ xa làm
  // mất chi tiết gấp nhiều lần so với mức nén, nên khung hình mới là thứ quyết định
  // có đọc được thông số hay không.
  spec: { title: "Hình 3", hint: "Thông số thiết bị hoặc vật tư thay thế — chụp cận cảnh, lấy đầy khung" },
};

/** Cột lưu khóa S3 tương ứng từng vị trí ảnh. */
export const USAGE_PHOTO_COLUMNS: Record<UsagePhotoSlot, "usagePhotoBeforeKey" | "usagePhotoAfterKey" | "usagePhotoSpecKey"> = {
  before: "usagePhotoBeforeKey",
  after: "usagePhotoAfterKey",
  spec: "usagePhotoSpecKey",
};

/** Đếm số ô đã có ảnh trên một phiếu. */
export function countUsagePhotos(t: {
  usagePhotoBeforeKey?: string | null;
  usagePhotoAfterKey?: string | null;
  usagePhotoSpecKey?: string | null;
}) {
  return [t.usagePhotoBeforeKey, t.usagePhotoAfterKey, t.usagePhotoSpecKey].filter(Boolean).length;
}

export function isUsagePhotoSlot(value: unknown): value is UsagePhotoSlot {
  return typeof value === "string" && (USAGE_PHOTO_SLOTS as readonly string[]).includes(value);
}

/** Ảnh gốc từ điện thoại có thể vài chục MB — chặn sớm trước khi giải mã. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Nén ảnh về JPEG 1280px.
 *
 * CỐ Ý không dùng WebP như preset ảnh chung của kho tệp: Word chỉ đọc được WebP từ
 * bản M365 gần đây, máy trong phân xưởng dùng Word cũ sẽ hiện ô ảnh vỡ trong BBNT.
 * JPEG thì bản Word nào cũng chèn được.
 */
export async function compressUsagePhoto(buffer: Buffer) {
  return sharp(buffer)
    .rotate() // ảnh điện thoại xoay theo EXIF; không xoay lại thì nằm ngang trong Word
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

function parseDataUrl(value: string) {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(value.trim());
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}

/** Nén rồi đưa lên S3, trả về khóa để ghi vào phiếu. */
export async function uploadUsagePhoto(
  ticketId: string,
  slot: UsagePhotoSlot,
  dataUrl: string
): Promise<{ key: string; url: string; bytes: number }> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("Dữ liệu ảnh không hợp lệ");
  if (parsed.buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error("Ảnh quá lớn, tối đa 12MB");

  const body = await compressUsagePhoto(parsed.buffer);
  // Khóa mang timestamp: thay ảnh cùng vị trí không ghi đè bản cũ giữa chừng, và
  // caller vẫn xóa được bản cũ sau khi bản mới lên thành công.
  const key = `public/Thay The Vat Tu/Anh hien truong/${vietnamDatePath(new Date())}/${ticketId}-${slot}-${Date.now()}.jpg`;
  await uploadS3Object({ key, body, contentType: "image/jpeg", originalName: `${slot}.jpg` });
  return { key, url: s3ProxyUrl(key), bytes: body.byteLength };
}

/** Xóa các ảnh đã lưu; lỗi xóa không được làm hỏng tác vụ nghiệp vụ gọi nó. */
export async function deleteUsagePhotos(keys: Array<string | null | undefined>) {
  let removed = 0;
  for (const key of keys) {
    if (!key) continue;
    try {
      await deleteS3ObjectByKey(key);
      removed += 1;
    } catch {
      // Tệp đã bị xóa tay hoặc kho tệp đang lỗi — bỏ qua, không chặn quyết toán.
    }
  }
  return removed;
}

/** Nạp ảnh để chèn vào BBNT; thiếu ảnh thì bỏ trống ô, không chặn xuất biên bản. */
export async function loadUsagePhotoBuffer(key: string | null | undefined) {
  if (!key) return null;
  try {
    return await getS3ObjectBuffer(key);
  } catch {
    return null;
  }
}
