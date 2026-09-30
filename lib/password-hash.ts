import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

// Argon2id theo mức khuyến nghị OWASP (m = 19 MiB, t = 2, p = 1): ~40–60 ms/lần băm trên
// server 4 nhân. Đổi tham số ở đây là đủ — hash cũ tự được băm lại ở lần đăng nhập kế tiếp
// (xem passwordNeedsRehash), không bắt ai đổi mật khẩu.
//
// KHÔNG import "server-only": script tsx (reset-admin-password, seed) cũng dùng file này.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const ARGON2_PARAMS = `m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}`;

/** Băm mật khẩu mới bằng Argon2id (mặc định của @node-rs/argon2). */
export async function hashPassword(password: string) {
  return argon2Hash(password, ARGON2_OPTIONS);
}

/**
 * So mật khẩu với hash đã lưu. Nhận cả hash Argon2 mới lẫn hash bcrypt ($2a/$2b/$2y)
 * còn lại từ trước 30/09/2026 — tài khoản chưa đăng nhập lại vẫn giữ hash bcrypt.
 */
export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored || !password) return false;
  if (stored.startsWith("$argon2")) {
    return argon2Verify(stored, password).catch(() => false);
  }
  if (/^\$2[aby]\$/.test(stored)) return bcrypt.compare(password, stored);
  return false;
}

/** True khi hash chưa phải Argon2id với đúng tham số hiện hành → nên băm lại sau khi đăng nhập đúng. */
export function passwordNeedsRehash(stored: string | null | undefined) {
  if (!stored) return false;
  return !stored.startsWith(`$argon2id$v=19$${ARGON2_PARAMS}$`);
}
