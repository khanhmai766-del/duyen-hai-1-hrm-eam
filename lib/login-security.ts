export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

export function loginFailureMessage(failedLoginAttempts: number, lockedAt?: Date | string | null) {
  if (lockedAt || failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return `Bạn đã nhập sai mật khẩu quá ${MAX_FAILED_LOGIN_ATTEMPTS} lần. Tài khoản đã bị khóa. Vui lòng liên hệ Quản trị để mở khóa.`;
  }

  const remaining = Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - failedLoginAttempts);
  return `Bạn đã nhập sai mật khẩu. Còn ${remaining} lần thử trước khi tài khoản bị khóa.`;
}
