import { NextResponse } from "next/server";
import { audit, fail, handle, requireUser } from "@/lib/api";
import {
  MODEL_CONTROL_ALLOWED_POSITION_KEYWORDS,
  MODEL_CONTROL_URL,
  positionAllowedByKeywords,
} from "@/lib/nav";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const allowed = positionAllowedByKeywords(
      MODEL_CONTROL_ALLOWED_POSITION_KEYWORDS,
      user,
      user.systemRole ?? user.role
    );
    if (!allowed) {
      return fail("Bạn không có quyền truy cập Điều khiển mô hình DH1", 403);
    }
    await audit(
      user.id,
      "MODEL_CONTROL_OPEN",
      "ExternalUtility",
      undefined,
      `Mở Điều khiển mô hình DH1 · Cương vị: ${user.position ?? "—"}`
    );
    return NextResponse.redirect(MODEL_CONTROL_URL);
  });
}
