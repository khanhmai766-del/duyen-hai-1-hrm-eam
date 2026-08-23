import type { Prisma, PrismaClient } from "@prisma/client";
import { uploadS3Object, deleteS3ObjectByKey, s3ProxyUrl, getS3ObjectBuffer } from "@/lib/s3";
import { vietnamDatePath } from "@/lib/material-document-name";
import { compressUsagePhoto, parseImageDataUrl, MAX_PHOTO_UPLOAD_BYTES } from "@/lib/material-usage-photo";

/**
 * ẢNH PHIẾU XUẤT KHO LIÊN 3.
 *
 * Mẫu QLVT.06 (Biên bản vật tư thu hồi) bắt buộc "nộp kèm bản photo Phiếu Giao hàng" —
 * chú thích số 6 ngay trong biểu mẫu. Ảnh này là bản chụp tờ liên 3 đó.
 *
 * ẢNH THUỘC VỀ LÔ, KHÔNG THUỘC VỀ PHIẾU. Một lô lãnh về thường được nhiều phiếu dùng dần:
 * phần chưa dùng hết nằm lại thành tồn, phiếu sau rút tiếp từ đúng lô ấy (FIFO) và vẫn phải
 * xuất kèm đúng tờ liên 3 ấy. Gắn ảnh vào phiếu thì phiếu sau không còn gì để in, và đó
 * chính là lý do luồng "Sử dụng hiện có" không cần bước tải ảnh nào cả — nó đọc ảnh của
 * các lô mà nó rút.
 *
 * Vòng đời: tải lên ở bước xác nhận vật tư lãnh (cùng chỗ nhập số phiếu giao hàng) → nhúng
 * vào BBTHVT mỗi lần xuất → xoá khi lô đã dùng hết VÀ mọi phiếu dùng lô đó đã quyết toán.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const DELIVERY_PHOTO_LABEL = "Ảnh phiếu xuất kho (liên 3)";
export const MISSING_DELIVERY_PHOTO_MESSAGE =
  "Vui lòng đính kèm ảnh phiếu xuất kho liên 3 — biên bản vật tư thu hồi bắt buộc nộp kèm bản photo phiếu giao hàng";

/**
 * Nén rồi đưa ảnh lên S3, trả khoá để gắn vào lô.
 *
 * `ownerId` chỉ để đặt tên tệp cho dễ truy vết — nhận id PHIẾU chứ không phải id lô, vì lúc
 * tải ảnh lên (đầu bước xác nhận vật tư lãnh) lô còn chưa được tạo. Việc tải lên phải nằm
 * NGOÀI giao dịch ghi kho: gọi mạng bên trong transaction là giữ khoá hàng suốt thời gian
 * chờ S3.
 */
export async function uploadDeliveryPhoto(
  ownerId: string,
  dataUrl: string
): Promise<{ key: string; url: string; bytes: number }> {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) throw new Error("Dữ liệu ảnh phiếu xuất kho không hợp lệ");
  if (parsed.buffer.byteLength > MAX_PHOTO_UPLOAD_BYTES) throw new Error("Ảnh quá lớn, tối đa 12MB");

  // Dùng chung bộ nén với ảnh hiện trường: liên 3 là giấy in chữ nhỏ, đúng loại ảnh mà
  // chroma 4:4:4 của bộ nén đó ăn tiền nhất.
  const body = await compressUsagePhoto(parsed.buffer);
  // Khoá mang timestamp để thay ảnh không ghi đè bản cũ giữa chừng.
  const key = `public/Thay The Vat Tu/Phieu xuat kho lien 3/${vietnamDatePath(new Date())}/${ownerId}-${Date.now()}.jpg`;
  await uploadS3Object({ key, body, contentType: "image/jpeg", originalName: "phieu-xuat-kho-lien-3.jpg" });
  return { key, url: s3ProxyUrl(key), bytes: body.byteLength };
}

/** Xoá ảnh đã lưu; lỗi xoá không được làm hỏng tác vụ nghiệp vụ gọi nó. */
export async function deleteDeliveryPhotos(keys: Array<string | null | undefined>) {
  let removed = 0;
  for (const key of keys) {
    if (!key) continue;
    try {
      await deleteS3ObjectByKey(key);
      removed += 1;
    } catch {
      // Tệp đã bị xoá tay hoặc kho tệp đang lỗi — bỏ qua, không chặn quyết toán.
    }
  }
  return removed;
}

/** Nạp ảnh để chèn vào BBTHVT; thiếu ảnh thì bỏ trống phụ lục, không chặn xuất biên bản. */
export async function loadDeliveryPhotoBuffer(key: string | null | undefined) {
  if (!key) return null;
  try {
    return await getS3ObjectBuffer(key);
  } catch {
    return null;
  }
}

/** URL xem ảnh qua proxy app — bucket không mở đọc ẩn danh, xem lib/s3.ts. */
export function deliveryPhotoUrl(key: string | null | undefined) {
  return key ? s3ProxyUrl(key) : null;
}

/**
 * Những lô mà biên bản thu hồi của một phiếu phải đính kèm liên 3.
 *
 * GỘP HAI TẬP, và chúng KHÔNG trùng nhau:
 *
 *  1. Lô phiếu ĐÃ RÚT (`MaterialLotUsage`) — nguồn thật của phần vật tư đã dùng. FIFO trừ lô cũ
 *     trước, nên phiếu lãnh về phiếu giao hàng mới vẫn có thể dùng hết phần tồn của phiếu cũ.
 *  2. Lô phiếu TỰ LÃNH VỀ — chính là số phiếu giao hàng in trên bảng của biên bản này.
 *
 * Chỉ lấy tập 1 thì gặp đúng cái bẫy: người dùng đính liên 3 cho phiếu giao hàng của mình, biên
 * bản in số phiếu ấy, nhưng phụ lục lại trống vì phần vật tư thực dùng đến từ lô cũ. Chỉ lấy tập
 * 2 thì mất tờ liên 3 của lô cũ — thứ mà kho thật sự cần khi vật tư đến từ tồn của phiếu trước.
 */
export async function deliveryPhotoLotsOfTicket(
  db: Db,
  ticketId: string,
  usedLots: Array<{ id: string; deliveryNote: string | null; used: number; deliveryPhotoKey: string | null }>
) {
  const ownLots = await db.materialStockLot.findMany({
    where: { ticketId },
    select: { id: true, deliveryNote: true, deliveryPhotoKey: true },
  });

  const merged = new Map<string, { deliveryNote: string | null; used: number; deliveryPhotoKey: string | null }>();
  for (const lot of usedLots) {
    merged.set(lot.id, { deliveryNote: lot.deliveryNote, used: lot.used, deliveryPhotoKey: lot.deliveryPhotoKey });
  }
  for (const lot of ownLots) {
    // `used: 0` = lô phiếu lãnh về nhưng chưa rút tới; chú thích sẽ chỉ ghi số phiếu, không ghi
    // số lượng, để không nói sai là đã dùng của lô đó.
    if (!merged.has(lot.id)) {
      merged.set(lot.id, { deliveryNote: lot.deliveryNote, used: 0, deliveryPhotoKey: lot.deliveryPhotoKey });
    }
  }
  return [...merged.values()].filter((lot) => lot.deliveryPhotoKey);
}

/**
 * Dọn ảnh liên 3 của những lô đã dùng hết VÀ mọi phiếu dùng lô đó đã quyết toán.
 *
 * Hai điều kiện chứ không phải một: lô hết hàng mà còn phiếu chưa quyết toán nghĩa là biên
 * bản của phiếu đó có thể còn phải xuất lại, mà xuất lại thì cần đúng tấm ảnh này. Xoá sớm
 * là mất bằng chứng giữa chừng.
 *
 * Gọi sau khi Thống kê quyết toán. Lỗi ở đây không được chặn quyết toán.
 */
export async function purgeSettledLotPhotos(db: Db, lotIds: string[]) {
  if (!lotIds.length) return 0;
  const lots = await db.materialStockLot.findMany({
    where: { id: { in: lotIds }, quantityLeft: { lte: 0 }, deliveryPhotoKey: { not: null } },
    select: {
      id: true,
      ticketId: true,
      deliveryPhotoKey: true,
      usages: { select: { ticketId: true } },
    },
  });
  if (!lots.length) return 0;

  let removed = 0;
  for (const lot of lots) {
    // `MaterialLotUsage.ticketId` mang giá trị "movement:<id>" cho sổ kho Vật tư khác —
    // đó không phải phiếu và không sinh BBTHVT, nên không phải chờ nó quyết toán.
    const ticketIds = [...new Set([lot.ticketId, ...lot.usages.map((u) => u.ticketId)])].filter(
      (id): id is string => typeof id === "string" && id.length > 0 && !id.startsWith("movement:")
    );
    if (ticketIds.length) {
      const pending = await db.materialTicket.count({ where: { id: { in: ticketIds }, settledAt: null } });
      if (pending > 0) continue;
    }
    removed += await deleteDeliveryPhotos([lot.deliveryPhotoKey]);
    await db.materialStockLot.update({
      where: { id: lot.id },
      data: { deliveryPhotoKey: null, deliveryPhotoAt: null, deliveryPhotoByName: null },
    });
  }
  return removed;
}
