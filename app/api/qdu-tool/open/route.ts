import { NextResponse } from "next/server";
import { audit, fail, handle, requireUser } from "@/lib/api";
import {
  QDU_TOOL_ALLOWED_POSITION_KEYWORDS,
  QDU_TOOL_URL,
  positionAllowedByKeywords,
} from "@/lib/nav";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const allowed = positionAllowedByKeywords(
      QDU_TOOL_ALLOWED_POSITION_KEYWORDS,
      user,
      user.systemRole ?? user.role
    );

    if (!allowed) {
      return fail("Bạn không có quyền truy cập Công cụ tính QDU", 403);
    }

    await audit(
      user.id,
      "QDU_TOOL_OPEN",
      "ExternalUtility",
      undefined,
      `Mở Công cụ tính QDU · Cương vị: ${user.position ?? "—"}`
    );

    return NextResponse.redirect(QDU_TOOL_URL);
  });
}
