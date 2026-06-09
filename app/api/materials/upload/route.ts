import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "materials");

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
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

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const stored = `${crypto.randomUUID()}${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(UPLOAD_DIR, stored), bytes);

    const url = `/uploads/materials/${stored}`;
    await audit(user.id, "UPLOAD_MATERIAL_IMAGE", "Material", stored, file.name);
    return ok({ url });
  });
}
