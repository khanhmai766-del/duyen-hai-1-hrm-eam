import type { NextRequest } from "next/server";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { uploadImageBufferToS3 } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** POST /api/defects/upload — tải ảnh khiếm khuyết (multipart field "file"). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["create", "manage", "full"], "Không đủ quyền tải ảnh khiếm khuyết");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Thiếu tệp ảnh");

    const ext = ALLOWED[file.type];
    if (!ext) return fail("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF");
    if (file.size > 15 * 1024 * 1024) return fail("Ảnh vượt quá 15MB");

    const uploaded = await uploadImageBufferToS3({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      folder: "defects/images",
      preset: "image",
    });

    await audit(user.id, "UPLOAD_DEFECT_IMAGE", "Defect", uploaded.key, file.name);
    return ok({ url: uploaded.url, key: uploaded.key });
  });
}
