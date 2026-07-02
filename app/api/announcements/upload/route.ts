import type { NextRequest } from "next/server";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { uploadBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAnnouncementManager(user: { id?: string; role: string }) {
  await requirePermissionLevel(user, "announcement-manage", ["manage", "full"], "Không đủ quyền tải tệp mệnh lệnh");
}

/** POST /api/announcements/upload — người có quyền quản lý upload PDF (multipart
 *  field "file"). Returns { url, name } to store on the announcement. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireAnnouncementManager(user);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Thiếu tệp tải lên");

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return fail("Chỉ chấp nhận tệp PDF");
    if (file.size > 25 * 1024 * 1024) return fail("Tệp vượt quá 25MB");

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadBufferToS3({
      buffer: bytes,
      contentType: "application/pdf",
      folder: "announcements/pdf",
      filename: file.name,
    });

    await audit(user.id, "UPLOAD_ANNOUNCEMENT_FILE", "Announcement", uploaded.key, file.name);
    return ok({ url: uploaded.url, key: uploaded.key, name: file.name });
  });
}
