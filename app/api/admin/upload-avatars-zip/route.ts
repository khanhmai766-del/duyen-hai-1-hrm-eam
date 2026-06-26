import type { NextRequest } from "next/server";
import { fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { uploadUserMediaZip } from "@/lib/admin-user-media";
import { requireUserImportEnabled } from "@/lib/admin-user-import-toggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    requireUserImportEnabled();
    try {
      return ok(await uploadUserMediaZip(await req.formData(), user.id, "avatar"));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Không xử lý được file zip ảnh đại diện");
    }
  });
}
