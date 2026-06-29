import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { passwordPolicyMessage } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return fail("Vui lòng nhập đầy đủ thông tin mật khẩu");
    }
    const policyError = passwordPolicyMessage(newPassword);
    if (policyError) return fail(policyError);
    if (newPassword !== confirmPassword) {
      return fail("Xác nhận mật khẩu mới không khớp");
    }

    const target = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });
    if (!target) return fail("Không tìm thấy tài khoản", 404);

    const valid = await bcrypt.compare(currentPassword, target.passwordHash);
    if (!valid) return fail("Mật khẩu hiện tại không đúng", 400);

    const samePassword = await bcrypt.compare(newPassword, target.passwordHash);
    if (samePassword) return fail("Mật khẩu mới không được trùng mật khẩu hiện tại");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await audit(user.id, "CHANGE_PASSWORD", "User", user.id);
    return ok({ changed: true });
  });
}
