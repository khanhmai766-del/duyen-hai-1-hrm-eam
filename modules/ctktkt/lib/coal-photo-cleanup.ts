import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredCoalPhotos, s3CoalPhotoStorage } from "./coal-photo-store";

/** Xoá ảnh công tơ than đã quá 30 giờ (cả tệp trên kho Server 3) và bộ đếm OCR cũ; không xoá số liệu báo cáo. */
export async function cleanupCoalPhotos(now = Date.now(), db = prisma, storage = s3CoalPhotoStorage) {
  const photos = await cleanupExpiredCoalPhotos(now, db, storage);
  const usage = await db.ctktktCoalPhotoUsage.deleteMany({ where: { bucket: { lt: Math.floor(now / 3_600_000) - 24 } } });
  return { photos, usageBuckets: usage.count };
}

export async function runCoalPhotoCleanup(request: Request, dependencies = {
  secret: process.env.CRON_SECRET,
  cleanup: cleanupCoalPhotos,
}) {
  const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
  const auth = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${dependencies.secret || ""}`);
  if (!dependencies.secret || auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
    return Response.json({ error: "Khóa tác vụ không hợp lệ." }, { status: 401, headers });
  }
  try {
    await dependencies.cleanup();
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "Chưa dọn được ảnh công tơ than hết hạn." }, { status: 503, headers });
  }
}
