import type { NextRequest } from "next/server";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { uploadBufferToS3, uploadImageBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * POST /api/materials/upload — ADMIN tải ảnh minh hoạ hoặc PDF đính kèm vật tư
 * (multipart, field "file", kind="image" | "document"). Trả về { url, name } để lưu vào vật tư.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "image");
    if (!(file instanceof File)) return fail(kind === "document" ? "Thiếu tệp PDF" : "Thiếu tệp ảnh");

    if (kind === "document") {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) return fail("Chỉ chấp nhận tệp PDF");
      if (file.size > 25 * 1024 * 1024) return fail("Tệp PDF vượt quá 25MB");

      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadBufferToS3({
        buffer: bytes,
        contentType: "application/pdf",
        folder: "materials/documents",
        filename: file.name,
      });

      await audit(user.id, "UPLOAD_MATERIAL_DOCUMENT", "Material", uploaded.key, file.name);
      return ok({ url: uploaded.url, key: uploaded.key, name: file.name });
    }

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
    return ok({ url: uploaded.url, key: uploaded.key, name: file.name });
  });
}
