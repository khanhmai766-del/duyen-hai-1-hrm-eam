import { fail, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitHandle } from "@/lib/server/work-permits";
import { findSimilarPermits } from "@/lib/server/work-permit-similar";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

/** GET — phiếu cùng sổ + cương vị có nội dung gần giống (biểu mẫu cấp phiếu hỏi lại trước khi lưu). Chỉ cảnh báo. */
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const p = new URL(req.url).searchParams;
    const kind = p.get("kind") ?? "", content = p.get("content") ?? "", position = p.get("position") ?? "";
    if (!["MECHANICAL", "ELECTRICAL"].includes(kind) || content.length > 5000 || position.length > 200) return fail("Tham số không hợp lệ");
    return ok(await findSimilarPermits(prisma, { kind, position, content, excludeId: p.get("exclude") }));
  });
}
