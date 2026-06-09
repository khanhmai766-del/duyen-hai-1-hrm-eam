import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single official roster (Vận hành 1), uploaded as a PDF by an admin.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const PDF_NAME = "lich-truc-ca-vh1.pdf";
const META_NAME = "lich-truc-ca-vh1.meta.json";
const PDF_PATH = path.join(UPLOAD_DIR, PDF_NAME);
const META_PATH = path.join(UPLOAD_DIR, META_NAME);
const PUBLIC_URL = `/uploads/${PDF_NAME}`;

interface RosterMeta {
  url: string;
  name: string; // original file name
  uploadedAt: string;
  uploadedBy: string;
}

async function readMeta(): Promise<RosterMeta | null> {
  try {
    const raw = await fs.readFile(META_PATH, "utf8");
    return JSON.parse(raw) as RosterMeta;
  } catch {
    return null;
  }
}

/** GET — current roster PDF metadata (or { url: null } if none uploaded). */
export async function GET() {
  return handle(async () => {
    await requireUser();
    const meta = await readMeta();
    return ok(meta ?? { url: null });
  });
}

/** POST — ADMIN uploads/replaces the roster PDF (multipart: field "file"). */
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
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(PDF_PATH, bytes);

    const meta: RosterMeta = {
      url: PUBLIC_URL,
      name: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.name ?? "—",
    };
    await fs.writeFile(META_PATH, JSON.stringify(meta), "utf8");

    await audit(user.id, "UPLOAD_ROSTER", "RosterSchedule", PDF_NAME, `Tải lên lịch trực ca: ${file.name}`);
    return ok(meta);
  });
}

/** DELETE — ADMIN removes the current roster PDF. */
export async function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    await fs.rm(PDF_PATH, { force: true });
    await fs.rm(META_PATH, { force: true });
    await audit(user.id, "DELETE_ROSTER", "RosterSchedule", PDF_NAME, "Xoá lịch trực ca");
    return ok({ url: null });
  });
}
