import { timingSafeEqual } from "node:crypto";
import { getRawDb } from "../db";

/** Chỉ xóa ảnh đã hết hạn bốn ca và bộ đếm OCR cũ; không xóa số liệu báo cáo. */
export async function cleanupCoalPhotos(now = Date.now(), db = getRawDb()) {
  const result = await db.batch([
    db.prepare("DELETE FROM coal_meter_photos WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM coal_photo_usage WHERE bucket < ?").bind(Math.floor(now / 3_600_000) - 24),
  ]);
  return { photos: result[0].meta.changes, usageBuckets: result[1].meta.changes };
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
