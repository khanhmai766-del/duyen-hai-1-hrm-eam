import type { NextRequest } from "next/server";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { uploadImageBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * POST /api/materials/upload — ADMIN tải ảnh minh hoạ vật tư (multipart, field
 * "file"). Trả về { url } để lưu vào trường imageUrl của vật tư.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Thiếu tệp ảnh");

    const ext = ALLOWED[file.type];
    if (!ext) return fail("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF");
    if (file.size > 5 * 1024 * 1024) return fail("Ảnh vượt quá 5MB");

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadImageBufferToS3({
      buffer: bytes,
      contentType: file.type,
      folder: "materials/images",
      preset: "image",
    });

    await audit(user.id, "UPLOAD_MATERIAL_IMAGE", "Material", uploaded.key, file.name);
    return ok({ url: uploaded.url, key: uploaded.key });
  });
}
