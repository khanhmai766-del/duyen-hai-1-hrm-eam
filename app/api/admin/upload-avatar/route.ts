import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { uploadSingleUserMedia } from "@/lib/admin-user-media";
import { requireUserImportEnabled } from "@/lib/admin-user-import-toggle";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "user-manage", ["manage", "full"], "Không đủ quyền upload ảnh đại diện người dùng");
    requireUserImportEnabled();
    try {
      return ok(await uploadSingleUserMedia(await req.formData(), user.id, "avatar"));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Không upload được ảnh đại diện");
    }
  });
}
