import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { writeActivityLog } from "@/lib/activity-log";
import { effectiveUserPosition } from "@/lib/current-position";
import { prisma } from "@/lib/prisma";
import { ADMIN_MODE_COOKIE, adminModeEnabled } from "@/lib/admin-mode";

let userPositionColumnsReady = false;

async function ensureUserPositionColumns() {
  if (userPositionColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "secondaryPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "secondaryPosition2" TEXT,
    ADD COLUMN IF NOT EXISTS "currentPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3)
    , ADD COLUMN IF NOT EXISTS "accessMode" TEXT NOT NULL DEFAULT 'NORMAL'
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
      accessMode: true,
      position: true,
      secondaryPosition: true,
      secondaryPosition2: true,
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
  const effectiveRole =
    dbUser.role === "ADMIN" && !adminModeEnabled(cookies().get(ADMIN_MODE_COOKIE)?.value)
      ? "MANAGER"
      : dbUser.role;
  return {
    ...session.user,
    ...dbUser,
    role: effectiveRole,
    systemRole: dbUser.role,
    position: currentPosition,
    primaryPosition: dbUser.position ?? undefined,
    secondaryPosition: dbUser.secondaryPosition ?? undefined,
    secondaryPosition2: dbUser.secondaryPosition2 ?? undefined,
    currentPosition,
  };
}

export function requireRole(user: { role: string }, roles: string[]) {
  if (!roles.includes(user.role)) {
    throw fail("Không đủ quyền truy cập", 403);
  }
}

/** Chỉ bổ sung cương vị đang làm việc vào nhật ký audit, không lưu vào dữ liệu nghiệp vụ. */
export function auditDetailWithPosition(
  user: { currentPosition?: string | null; position?: string | null },
  detail?: string | null
) {
  const position = user.currentPosition ?? user.position;
  return [detail?.trim(), position ? `Cương vị thao tác: ${position}` : null]
    .filter(Boolean)
    .join(" · ") || undefined;
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
    /** Dùng khi response/phần giao diện phụ thuộc ngay vào mốc audit vừa ghi. */
    durable?: boolean;
  }
) {
  const activity = writeActivityLog({
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
  // Một vài luồng dùng AuditLog làm nguồn trạng thái (vd. "lần đồng bộ gần nhất").
  // Các luồng đó phải chờ INSERT xong, nếu không UI có thể báo thành công nhưng vẫn
  // đọc lại mốc cũ ngay sau response.
  if (options?.durable) await activity;
}
