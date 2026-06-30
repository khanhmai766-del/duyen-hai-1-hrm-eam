import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { safeEmployeeCode, uploadS3Object, userWithSignedMedia } from "@/lib/s3";

export const dynamic = "force-dynamic";

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

async function signatureUpdate(value: unknown, employeeId: string) {
  if (value === undefined) return {};
  const raw = String(value ?? "").trim();
  if (!raw) return { signatureUrl: null, signatureKey: null };
  if (isS3ProxyUrl(raw)) return {};
  const match = raw.match(DATA_URL_RE);
  if (!match) return { signatureUrl: raw, signatureKey: null };

  const mimeType = match[1];
  const ext = extensionForMime(mimeType);
  const code = safeEmployeeCode(employeeId);
  const key = `signatures/${code}.${ext}`;
  await uploadS3Object({
    key,
    body: Buffer.from(match[2], "base64"),
    contentType: mimeType,
    originalName: `${code}.${ext}`,
  });
  return { signatureUrl: null, signatureKey: key };
}

// Self-service profile update. Everyone may edit employeeId / phone / email làm việc /
// signature on their own record; only ADMIN may change avatar, email công ty đăng nhập and
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
      if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;
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
    Object.assign(data, await signatureUpdate(body.signatureUrl, employeeId));

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await audit(user.id, "UPDATE_PROFILE", "User", user.id);
    const { passwordHash, ...safe } = updated;
    return ok(await userWithSignedMedia(safe));
  });
}
