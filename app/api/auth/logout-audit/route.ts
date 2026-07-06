import type { NextRequest } from "next/server";
import { handle, ok, requireUser } from "@/lib/api";
import { requestAuditMeta, writeActivityLog } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? "manual").trim();
    const detail = reason === "timeout" ? "Tự động đăng xuất do hết phiên/không hoạt động" : "Người dùng đăng xuất";
    const meta = requestAuditMeta(req);

    await writeActivityLog({
      actorUserId: user.id,
      actorName: user.name,
      action: "LOGOUT",
      targetType: "User",
      targetId: user.id,
      detail,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return ok({ logged: true });
  });
}
