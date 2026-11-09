import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Giao dịch Prisma dùng trong module KTKT (giai đoạn 3 — thay `getRawDb()`). */
export type KtktTx = Prisma.TransactionClient;

/**
 * Mốc giờ dạng các cột thời gian KTKT ("YYYY-MM-DD HH:mm:ss", giờ UTC) — đúng định dạng
 * `to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', …)` mà SQL cũ ghi (db/sql.ts). Lấy giờ máy ứng dụng (đồng bộ NTP).
 */
export function ktktUtcNow(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Tăng phiên bản đọc (Google Mirror/ETag dựa vào bảng này) — như bước cuối mọi giao dịch ghi của db/index.ts. */
export async function bumpReadVersions(tx: KtktTx, keys: readonly string[]) {
  for (const cache_key of new Set(keys)) {
    await tx.ctktktOperationalReadVersions.upsert({
      where: { cache_key }, create: { cache_key, version: 1 }, update: { version: { increment: 1 } },
    });
  }
}

/**
 * Một lần ghi KTKT: dữ liệu + phiên bản đọc cùng commit; lỗi ở bất kỳ bước nào đều rollback.
 * Như bản cũ, phiên bản vẫn tăng khi câu ghi không trúng dòng nào (vd xoá bản ghi không tồn tại).
 */
export function ktktWrite<T>(keys: readonly string[], work: (tx: KtktTx) => Promise<T>) {
  return prisma.$transaction(async tx => {
    const result = await work(tx);
    await bumpReadVersions(tx, keys);
    return result;
  });
}
