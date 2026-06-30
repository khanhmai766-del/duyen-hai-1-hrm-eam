import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { deleteFromS3, keyFromPublicUrl, s3ProxyUrl, uploadBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROSTER_META_KEY = "roster-schedule";

interface RosterMeta {
  url: string;
  key?: string;
  name: string; // original file name
  uploadedAt: string;
  uploadedBy: string;
}

async function readMeta(): Promise<RosterMeta | null> {
  const row = await prisma.rbacConfig.findUnique({ where: { key: ROSTER_META_KEY } });
  if (!row?.value) return null;
  const meta = JSON.parse(row.value) as RosterMeta;
  const key = meta.key ?? keyFromPublicUrl(meta.url);
  return key ? { ...meta, key, url: s3ProxyUrl(key) } : meta;
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

    const bytes = Buffer.from(await file.arrayBuffer());
    const previous = await readMeta();
    const uploaded = await uploadBufferToS3({
      buffer: bytes,
      contentType: "application/pdf",
      folder: "roster/pdf",
      filename: file.name,
    });

    const meta: RosterMeta = {
      url: s3ProxyUrl(uploaded.key),
      key: uploaded.key,
      name: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.name ?? "—",
    };
    await prisma.rbacConfig.upsert({
      where: { key: ROSTER_META_KEY },
      create: { key: ROSTER_META_KEY, value: JSON.stringify(meta), updatedById: user.id },
      update: { value: JSON.stringify(meta), updatedById: user.id, updatedAt: new Date() },
    });
    if (previous?.url) await deleteFromS3(previous.url);

    await audit(user.id, "UPLOAD_ROSTER", "RosterSchedule", uploaded.key, `Tải lên lịch trực ca: ${file.name}`);
    return ok(meta);
  });
}

/** DELETE — ADMIN removes the current roster PDF. */
export async function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const previous = await readMeta();
    if (previous?.url) await deleteFromS3(previous.url);
    await prisma.rbacConfig.deleteMany({ where: { key: ROSTER_META_KEY } });
    await audit(user.id, "DELETE_ROSTER", "RosterSchedule", ROSTER_META_KEY, "Xoá lịch trực ca");
    return ok({ url: null });
  });
}
