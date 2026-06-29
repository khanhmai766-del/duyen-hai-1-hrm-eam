export const DEFAULT_PASSWORD = "password123";
export const PASSWORD_MAX_AGE_DAYS = 90;

export function passwordPolicyMessage(password: string) {
  if (password.length < 8) return "Mật khẩu mới cần tối thiểu 8 ký tự";
  if (!/[A-Z]/.test(password)) return "Mật khẩu mới cần có ít nhất 1 chữ hoa";
  if (!/[a-z]/.test(password)) return "Mật khẩu mới cần có ít nhất 1 chữ thường";
  if (!/[0-9]/.test(password)) return "Mật khẩu mới cần có ít nhất 1 chữ số";
  if (!/[^A-Za-z0-9]/.test(password)) return "Mật khẩu mới cần có ít nhất 1 ký tự đặc biệt";
  return null;
}

export function isDefaultPassword(password: string) {
  return password === DEFAULT_PASSWORD;
}

export function isPasswordExpired(passwordChangedAt?: Date | string | null, now = new Date()) {
  if (!passwordChangedAt) return true;
  const changedAt = passwordChangedAt instanceof Date ? passwordChangedAt : new Date(passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return true;
  return now.getTime() - changedAt.getTime() >= PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
