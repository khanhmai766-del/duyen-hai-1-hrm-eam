import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

// Self-service profile update. Everyone may edit avatar / employeeId / phone /
// email on their own record; ADMIN may additionally edit name / position /
// department / role.
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const isAdmin = user.role === "ADMIN";

    const data: Record<string, unknown> = {};
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;
    if (body.signatureUrl !== undefined) data.signatureUrl = body.signatureUrl || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.email) data.email = body.email;
    if (body.employeeId) data.employeeId = body.employeeId;
    if (isAdmin) {
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
    return ok(safe);
  });
}
