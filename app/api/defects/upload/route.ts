import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "defects");

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** POST /api/defects/upload — tải ảnh khiếm khuyết (multipart field "file"). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Thiếu tệp ảnh");

    const ext = ALLOWED[file.type];
    if (!ext) return fail("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF");
    if (file.size > 5 * 1024 * 1024) return fail("Ảnh vượt quá 5MB");

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const stored = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));

    const url = `/uploads/defects/${stored}`;
    await audit(user.id, "UPLOAD_DEFECT_IMAGE", "Defect", stored, file.name);
    return ok({ url });
  });
}
