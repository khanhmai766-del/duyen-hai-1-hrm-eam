import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeActivityLog } from "@/lib/activity-log";

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
  return session.user;
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
  try {
    await writeActivityLog({
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
    });
  } catch {
    // non-fatal
  }
}
