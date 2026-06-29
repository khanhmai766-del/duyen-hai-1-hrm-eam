import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3-storage";
import { DEFAULT_PASSWORD } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

async function safe<T extends { passwordHash?: string; avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }>(u: T) {
  const { passwordHash, ...rest } = u;
  return userWithSignedMedia(rest);
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const users = await prisma.user.findMany({ orderBy: { employeeId: "asc" } });
    return ok(await Promise.all(users.map(safe)));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    const username = String(body.username ?? "").trim() || null;
    const email = String(body.email ?? "").trim().toLowerCase();
    const workEmail = String(body.workEmail ?? "").trim().toLowerCase() || null;
    if (!body.name || !email || !body.employeeId || !username) return fail("Thiếu thông tin bắt buộc");
    const exists = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { employeeId: body.employeeId },
          ...(username ? [{ username }] : []),
        ],
      },
    });
    if (exists) return fail("Email, user hoặc mã nhân viên đã tồn tại");
    const password = String(body.password || DEFAULT_PASSWORD);
    const created = await prisma.user.create({
      data: {
        name: body.name,
        email,
        workEmail,
        username,
        employeeId: body.employeeId,
        phone: body.phone || null,
        role: body.role || "VIEWER",
        position: body.position || null,
        department: body.department || null,
        avatarUrl: body.avatarUrl || null,
        signatureUrl: body.signatureUrl || null,
        avatarKey: body.avatarKey || null,
        signatureKey: body.signatureKey || null,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: password === DEFAULT_PASSWORD,
        passwordChangedAt: new Date(),
      },
    });
    await audit(user.id, "CREATE_USER", "User", created.id, created.name);
    return ok(await safe(created));
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    if (body.resetPassword) {
      const updated = await prisma.user.update({
        where: { id: body.id },
        data: {
          passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 10),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
      });
      await audit(user.id, "RESET_PASSWORD", "User", updated.id, updated.name);
      return ok(await safe(updated));
    }
    const data: any = {};
    if (body.role) data.role = body.role;
    if (body.isActive != null) data.isActive = body.isActive;
    if (body.name) data.name = body.name;
    if (body.position !== undefined) data.position = body.position;
    if (body.department !== undefined) data.department = body.department;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;
    if (body.signatureUrl !== undefined) data.signatureUrl = body.signatureUrl || null;
    if (body.avatarKey !== undefined) data.avatarKey = body.avatarKey || null;
    if (body.signatureKey !== undefined) data.signatureKey = body.signatureKey || null;
    if (body.email) data.email = String(body.email).trim().toLowerCase();
    if (body.workEmail !== undefined) data.workEmail = String(body.workEmail || "").trim().toLowerCase() || null;
    if (body.username !== undefined) data.username = String(body.username || "").trim() || null;
    if (body.employeeId) data.employeeId = body.employeeId;

    if (data.email) {
      const ex = await prisma.user.findFirst({ where: { email: data.email, NOT: { id: body.id } } });
      if (ex) return fail("Email đã tồn tại");
    }
    if (data.employeeId) {
      const ex = await prisma.user.findFirst({ where: { employeeId: data.employeeId, NOT: { id: body.id } } });
      if (ex) return fail("Mã nhân viên đã tồn tại");
    }
    if (data.username) {
      const ex = await prisma.user.findFirst({ where: { username: data.username as string, NOT: { id: body.id } } });
      if (ex) return fail("User đã tồn tại");
    }

    const updated = await prisma.user.update({ where: { id: body.id }, data });
    await audit(user.id, "UPDATE_USER", "User", updated.id, updated.name);
    return ok(await safe(updated));
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id");
    if (id === user.id) return fail("Không thể xoá chính tài khoản đang đăng nhập");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("Không tìm thấy người dùng", 404);
    try {
      await prisma.user.delete({ where: { id } });
    } catch (e: any) {
      // Foreign-key constraint (has check-ins / repairs / etc.) → deactivate instead.
      if (e?.code === "P2003") {
        await prisma.user.update({ where: { id }, data: { isActive: false } });
        await audit(user.id, "DEACTIVATE_USER", "User", id, target.name);
        return fail("Người dùng có dữ liệu liên quan nên không thể xoá — đã chuyển sang trạng thái ngừng hoạt động.");
      }
      throw e;
    }
    await audit(user.id, "DELETE_USER", "User", id, target.name);
    return ok({ id });
  });
}
