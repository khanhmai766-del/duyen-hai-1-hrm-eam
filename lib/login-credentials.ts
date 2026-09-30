import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_FAILED_LOGIN_ATTEMPTS } from "@/lib/login-security";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@/lib/password-hash";

// Mọi chỗ nhận mật khẩu từ người CHƯA đăng nhập (form đăng nhập, đăng ký Passkey) phải đi
// qua đây để cùng một bộ đếm khóa tài khoản — trước 30/09/2026
// /api/webauthn/register/options so mật khẩu mà không đếm lần sai, thành đường dò mật khẩu
// không bị khóa.

export function findLoginUser(login: string) {
  return prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
  });
}

export function checkPassword(user: Pick<User, "passwordHash">, password: string) {
  return verifyPassword(password, user.passwordHash);
}

export async function recordLoginFailure(user: Pick<User, "id" | "failedLoginAttempts">) {
  const failedLoginAttempts = user.failedLoginAttempts + 1;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts,
      lockedAt: failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date() : null,
    },
  });
}

/** Xoá bộ đếm sai và băm lại mật khẩu bằng Argon2id nếu hash còn là bcrypt/tham số cũ. */
export async function recordLoginSuccess(user: Pick<User, "id" | "failedLoginAttempts" | "passwordHash">, password: string) {
  const data: { failedLoginAttempts?: number; lockedAt?: null; passwordHash?: string } = {};
  if (user.failedLoginAttempts > 0) {
    data.failedLoginAttempts = 0;
    data.lockedAt = null;
  }
  if (passwordNeedsRehash(user.passwordHash)) {
    data.passwordHash = await hashPassword(password);
  }
  if (Object.keys(data).length) await prisma.user.update({ where: { id: user.id }, data });
}
