import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, requireRole } from "@/lib/api";
import { deleteFromS3, keyFromPublicUrl, s3ProxyUrl, uploadBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_GUIDE_META_KEY = "device-guide-doc";

interface DeviceGuideMeta {
  url: string;
  key?: string;
  name: string; // tên tệp gốc
  uploadedAt: string;
  uploadedBy: string;
}

async function readMeta(): Promise<DeviceGuideMeta | null> {
  const row = await prisma.rbacConfig.findUnique({ where: { key: DEVICE_GUIDE_META_KEY } });
  if (!row?.value) return null;
  const meta = JSON.parse(row.value) as DeviceGuideMeta;
  const key = meta.key ?? keyFromPublicUrl(meta.url);
  return key ? { ...meta, key, url: s3ProxyUrl(key) } : meta;
}

/** GET — thông tin tệp PDF hướng dẫn hiện tại (hoặc { url: null } khi chưa có). */
export async function GET() {
  return handle(async () => {
    await requireUser();
    const meta = await readMeta();
    return ok(meta ?? { url: null });
  });
}

/** POST — chỉ Quản trị hệ thống được tải lên/thay thế tệp PDF hướng dẫn. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Thiếu tệp tải lên");

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return fail("Chỉ chấp nhận tệp PDF");
    if (file.size > 25 * 1024 * 1024) return fail("Tệp vượt quá 25MB");

    const bytes = Buffer.from(await file.arrayBuffer());
    const previous = await readMeta();
    // Dùng chung thư mục với lịch trực ca (xem app/api/roster-schedule/route.ts).
    const uploaded = await uploadBufferToS3({
      buffer: bytes,
      contentType: "application/pdf",
      folder: "roster/pdf",
      filename: file.name,
    });

    const meta: DeviceGuideMeta = {
      url: s3ProxyUrl(uploaded.key),
      key: uploaded.key,
      name: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.name ?? "—",
    };
    await prisma.rbacConfig.upsert({
      where: { key: DEVICE_GUIDE_META_KEY },
      create: { key: DEVICE_GUIDE_META_KEY, value: JSON.stringify(meta), updatedById: user.id },
      update: { value: JSON.stringify(meta), updatedById: user.id, updatedAt: new Date() },
    });
    if (previous?.url) await deleteFromS3(previous.url);

    await audit(user.id, "UPLOAD_DEVICE_GUIDE", "DeviceGuide", uploaded.key, `Tải lên tài liệu hướng dẫn thiết bị: ${file.name}`);
    return ok(meta);
  });
}

/** DELETE — chỉ Quản trị hệ thống được gỡ tệp PDF hướng dẫn hiện tại. */
export async function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const previous = await readMeta();
    if (previous?.url) await deleteFromS3(previous.url);
    await prisma.rbacConfig.deleteMany({ where: { key: DEVICE_GUIDE_META_KEY } });
    await audit(user.id, "DELETE_DEVICE_GUIDE", "DeviceGuide", DEVICE_GUIDE_META_KEY, "Xoá tài liệu hướng dẫn thiết bị");
    return ok({ url: null });
  });
}
