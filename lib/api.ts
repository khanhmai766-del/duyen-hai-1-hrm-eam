import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeActivityLog } from "@/lib/activity-log";
import { effectiveUserPosition } from "@/lib/current-position";
import { prisma } from "@/lib/prisma";

let userPositionColumnsReady = false;

async function ensureUserPositionColumns() {
  if (userPositionColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "secondaryPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "currentPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3)
  `);
  userPositionColumnsReady = true;
}

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ data, meta: meta ?? null, error: null });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ data: null, meta: null, error }, { status });
}

/** Returns the session user or throws a NextResponse to short-circuit. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    throw fail("Chưa đăng nhập", 401);
  }
  await ensureUserPositionColumns();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      position: true,
      secondaryPosition: true,
      currentPosition: true,
      employeeId: true,
      name: true,
      email: true,
      isActive: true,
      lockedAt: true,
      mustChangePassword: true,
    },
  }).catch(() => null);
  if (!dbUser?.isActive || dbUser.lockedAt) throw fail("Tài khoản không hợp lệ", 401);
  const currentPosition = effectiveUserPosition(dbUser) ?? undefined;
  return {
    ...session.user,
    ...dbUser,
    position: currentPosition,
    primaryPosition: dbUser.position ?? undefined,
    secondaryPosition: dbUser.secondaryPosition ?? undefined,
    currentPosition,
  };
}

export function requireRole(user: { role: string }, roles: string[]) {
  if (!roles.includes(user.role)) {
    throw fail("Không đủ quyền truy cập", 403);
  }
}

/** Wraps a handler so thrown NextResponses become the response. */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((e) => {
    if (e instanceof Response) return e;
    console.error(e);
    return fail("Lỗi máy chủ", 500);
  });
}

export async function audit(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string,
  options?: {
    actorName?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    changedFields?: string[];
    ipAddress?: string | null;
    userAgent?: string | null;
    saveToAuditLog?: boolean;
  }
) {
  // Ghi log KHÔNG chặn response: kích hoạt ở chế độ nền (không await) để mutation
  // trả kết quả ngay, không phải đợi 1-2 insert DB + (tuỳ chọn) upload S3. App chạy
  // trên Node server (VPS) nên promise nền vẫn hoàn tất sau khi response đã gửi.
  // Lỗi ghi log là không nghiêm trọng → nuốt qua .catch.
  void writeActivityLog({
    actorUserId: userId,
    actorName: options?.actorName,
    action,
    targetType: entity,
    targetId: entityId,
    detail,
    beforeData: options?.beforeData,
    afterData: options?.afterData,
    changedFields: options?.changedFields,
    ipAddress: options?.ipAddress,
    userAgent: options?.userAgent,
    saveToAuditLog: options?.saveToAuditLog,
  }).catch(() => {
    // non-fatal
  });
}
