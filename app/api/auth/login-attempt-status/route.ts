import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginFailureMessage } from "@/lib/login-security";

let loginLockColumnsReady = false;

async function ensureLoginLockColumns() {
  if (loginLockColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3)
  `);
  loginLockColumnsReady = true;
}

// Câu trả lời CHUNG cho mọi trường hợp không có gì để tiết lộ (tài khoản không tồn tại,
// bị vô hiệu, hoặc chưa từng sai mật khẩu). Đồng nhất để không thể dò tài khoản
// (user enumeration): kẻ dò không phân biệt được email nào tồn tại trong hệ thống.
const GENERIC_MESSAGE = "Email/User hoặc mật khẩu không đúng.";

/* Rate-limit nhẹ theo IP (in-memory — app chạy 1 process pm2 nên đủ dùng):
   chặn quét hàng loạt endpoint công khai này. */
const RATE_LIMIT = 30; // lần / cửa sổ
const RATE_WINDOW_MS = 5 * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  // Dọn entry hết hạn để Map không phình vô hạn.
  if (hits.size > 1000) {
    for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function POST(req: Request) {
  const generic = () =>
    NextResponse.json({ data: { message: GENERIC_MESSAGE }, meta: null, error: null });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Vượt hạn mức: vẫn trả câu chung (không lộ việc bị chặn) để không tạo oracle mới.
  if (rateLimited(ip)) return generic();

  await ensureLoginLockColumns();
  const body = await req.json().catch(() => ({}));
  const login = String(body.email ?? "").trim();
  if (!login) return generic();

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
    select: { isActive: true, failedLoginAttempts: true, lockedAt: true },
  });

  // Không tồn tại / vô hiệu / CHƯA TỪNG sai mật khẩu → cùng một câu chung.
  // Thông tin số lần thử chỉ xuất hiện sau khi đã có lần đăng nhập sai thật
  // (chính người dùng vừa gây ra ngay trước lời gọi này) — giữ nguyên UX cảnh báo khóa.
  if (!user || !user.isActive || (!user.lockedAt && user.failedLoginAttempts === 0)) {
    return generic();
  }

  return NextResponse.json({
    data: { message: loginFailureMessage(user.failedLoginAttempts, user.lockedAt) },
    meta: null,
    error: null,
  });
}
