import type { NextRequest } from "next/server";
import { fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { uploadSingleUserMedia } from "@/lib/admin-user-media";
import { requireUserImportEnabled } from "@/lib/admin-user-import-toggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    requireUserImportEnabled();
    try {
      return ok(await uploadSingleUserMedia(await req.formData(), user.id, "signature"));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Không upload được chữ ký");
    }
  });
}
