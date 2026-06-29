import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { safeEmployeeCode, uploadS3Object, userWithSignedMedia } from "@/lib/s3-storage";

export const dynamic = "force-dynamic";

type MediaKind = "avatar" | "signature";

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

function extensionForMime(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Chỉ chấp nhận ảnh jpg, png hoặc webp");
  }
}

function isS3ProxyUrl(value: string) {
  return value.startsWith("/api/files/s3?") || value.includes("/api/files/s3?");
}

async function mediaUpdate(kind: MediaKind, value: unknown, employeeId: string) {
  if (value === undefined) return {};
  const raw = String(value ?? "").trim();
  const keyField = kind === "avatar" ? "avatarKey" : "signatureKey";
  const urlField = kind === "avatar" ? "avatarUrl" : "signatureUrl";
  if (!raw) return { [urlField]: null, [keyField]: null };
  if (isS3ProxyUrl(raw)) return {};
  const match = raw.match(DATA_URL_RE);
  if (!match) return { [urlField]: raw, [keyField]: null };

  const mimeType = match[1];
  const ext = extensionForMime(mimeType);
  const code = safeEmployeeCode(employeeId);
  const key = `${kind === "avatar" ? "avatars" : "signatures"}/${code}.${ext}`;
  await uploadS3Object({
    key,
    body: Buffer.from(match[2], "base64"),
    contentType: mimeType,
    originalName: `${code}.${ext}`,
  });
  return { [urlField]: null, [keyField]: key };
}

// Self-service profile update. Everyone may edit employeeId / phone / email làm việc /
// avatar / signature on their own record; only ADMIN may change email công ty đăng nhập and
// name / position / department / role.
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const isAdmin = user.role === "ADMIN";

    const data: Record<string, unknown> = {};
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.workEmail !== undefined) data.workEmail = String(body.workEmail || "").trim().toLowerCase() || null;
    if (body.employeeId) data.employeeId = body.employeeId;
    if (isAdmin) {
      if (body.email) data.email = String(body.email).trim().toLowerCase();
      if (body.name) data.name = body.name;
      if (body.position !== undefined) data.position = body.position || null;
      if (body.department !== undefined) data.department = body.department || null;
      if (body.role) data.role = body.role;
    }

    if (data.email) {
      const ex = await prisma.user.findFirst({ where: { email: data.email as string, NOT: { id: user.id } } });
      if (ex) return fail("Email đã tồn tại");
    }
    if (data.employeeId) {
      const ex = await prisma.user.findFirst({ where: { employeeId: data.employeeId as string, NOT: { id: user.id } } });
      if (ex) return fail("Mã nhân viên đã tồn tại");
    }

    const employeeId = String(data.employeeId ?? user.employeeId ?? "").trim();
    Object.assign(data, await mediaUpdate("avatar", body.avatarUrl, employeeId));
    Object.assign(data, await mediaUpdate("signature", body.signatureUrl, employeeId));

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await audit(user.id, "UPDATE_PROFILE", "User", user.id);
    const { passwordHash, ...safe } = updated;
    return ok(await userWithSignedMedia(safe));
  });
}
