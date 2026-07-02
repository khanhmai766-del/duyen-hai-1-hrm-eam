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

export async function POST(req: Request) {
  await ensureLoginLockColumns();
  const body = await req.json().catch(() => ({}));
  const login = String(body.email ?? "").trim();

  if (!login) {
    return NextResponse.json({
      data: { message: "Email/User hoặc mật khẩu không đúng." },
      meta: null,
      error: null,
    });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
    select: {
      isActive: true,
      failedLoginAttempts: true,
      lockedAt: true,
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({
      data: { message: "Email/User hoặc mật khẩu không đúng." },
      meta: null,
      error: null,
    });
  }

  return NextResponse.json({
    data: {
      message: loginFailureMessage(user.failedLoginAttempts, user.lockedAt),
    },
    meta: null,
    error: null,
  });
}
