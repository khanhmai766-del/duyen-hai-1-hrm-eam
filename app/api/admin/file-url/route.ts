import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { signedS3Url } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "user-manage", ["read", "manage", "full"], "Không đủ quyền xem file người dùng");
    const key = req.nextUrl.searchParams.get("key")?.trim();
    if (!key) return fail("Thiếu key");
    if (key.startsWith("/") || key.includes("..")) return fail("Key không hợp lệ");
    try {
      return ok({ key, url: await signedS3Url(key) });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Không tạo được URL tạm thời");
    }
  });
}
