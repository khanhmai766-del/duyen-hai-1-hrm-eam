import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "announcements");

/** POST /api/announcements/upload — ADMIN uploads a PDF attachment (multipart
 *  field "file"). Returns { url, name } to store on the announcement. */
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

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const stored = `${crypto.randomUUID()}.pdf`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(UPLOAD_DIR, stored), bytes);

    const url = `/uploads/announcements/${stored}`;
    await audit(user.id, "UPLOAD_ANNOUNCEMENT_FILE", "Announcement", stored, file.name);
    return ok({ url, name: file.name });
  });
}
