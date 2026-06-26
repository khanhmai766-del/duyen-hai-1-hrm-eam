import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3-storage";

export const dynamic = "force-dynamic";

// Self-service profile update. Everyone may edit employeeId / phone / email /
// signature on their own record; only ADMIN may change the avatar and the
// name / position / department / role.
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const isAdmin = user.role === "ADMIN";

    const data: Record<string, unknown> = {};
    if (body.signatureUrl !== undefined) data.signatureUrl = body.signatureUrl || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.email) data.email = body.email;
    if (body.employeeId) data.employeeId = body.employeeId;
    if (isAdmin) {
      // Chỉ quản trị viên mới được thay ảnh đại diện.
      if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;
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

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await audit(user.id, "UPDATE_PROFILE", "User", user.id);
    const { passwordHash, ...safe } = updated;
    return ok(await userWithSignedMedia(safe));
  });
}
