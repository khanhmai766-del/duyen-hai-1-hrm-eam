/**
 * AUTH_SECRET của NextAuth — khóa ký token đăng nhập Passkey (lib/webauthn.ts).
 * KHÔNG có giá trị dự phòng: trước 30/09/2026 lib/webauthn.ts rơi về chuỗi cố định
 * "dev-passkey-secret" khi thiếu biến môi trường, tức ai đọc mã nguồn cũng tự ký được
 * token đăng nhập Passkey. Thiếu cấu hình thì phải hỏng to, không được âm thầm yếu đi.
 */
export function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Máy chủ chưa cấu hình AUTH_SECRET");
  return secret;
}

