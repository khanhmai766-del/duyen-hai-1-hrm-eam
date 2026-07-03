import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { safeEmployeeCode, uploadS3Object, userWithSignedMedia } from "@/lib/s3";
import { avatarUpdate } from "@/lib/user-avatar-storage";
import { isValidCurrentPosition } from "@/lib/current-position";
import { invalidateUserSummaryCache } from "@/lib/user-summary-cache";

export const dynamic = "force-dynamic";

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

async function ensureUserCurrentPositionColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "secondaryPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "currentPosition" TEXT
  `);
}

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

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await ensureUserCurrentPositionColumn();
    const profile = await prisma.user.findUnique({ where: { id: user.id } });
    if (!profile) return fail("Tài khoản không hợp lệ", 401);
    const { passwordHash, ...safe } = profile;
    return ok(await userWithSignedMedia(safe));
  });
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
    await ensureUserCurrentPositionColumn();
    const body = await req.json();
    const isAdmin = user.role === "ADMIN";
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { position: true, secondaryPosition: true, currentPosition: true },
    });
    if (!existing) return fail("Tài khoản không hợp lệ", 401);

    const data: Record<string, unknown> = {};
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.workEmail !== undefined) data.workEmail = String(body.workEmail || "").trim().toLowerCase() || null;
    if (body.employeeId) data.employeeId = body.employeeId;
    if (body.currentPosition !== undefined) {
      const currentPosition = String(body.currentPosition || "").trim() || null;
      if (!isValidCurrentPosition(existing, currentPosition)) return fail("Chức vụ hiện tại không hợp lệ", 400);
      data.currentPosition = currentPosition;
    }
    if (isAdmin) {
      if (body.email) data.email = String(body.email).trim().toLowerCase();
      if (body.name) data.name = body.name;
      if (body.position !== undefined) data.position = body.position || null;
      if (body.secondaryPosition !== undefined) data.secondaryPosition = body.secondaryPosition || null;
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
    if (isAdmin) Object.assign(data, await avatarUpdate(body.avatarUrl, employeeId));
    Object.assign(data, await signatureUpdate(body.signatureUrl, employeeId));

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await audit(user.id, "UPDATE_PROFILE", "User", user.id);
    invalidateUserSummaryCache();
    const { passwordHash, ...safe } = updated;
    return ok(await userWithSignedMedia(safe));
  });
}
