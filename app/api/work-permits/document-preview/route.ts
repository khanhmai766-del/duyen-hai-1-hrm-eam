import type { WorkPermit } from "@prisma/client";
import { fail, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { effectivePermitFormat, PERMIT_STATUSES, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitBody, permitHandle } from "@/lib/server/work-permits";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { resolvePermitSafety } from "@/lib/server/work-permit-safety";
import { createWorkPermitDocument } from "@/lib/server/work-permit-document";
export const dynamic = "force-dynamic";

/**
 * Điền mẫu Word từ dữ liệu đang nhập trên biểu mẫu (chưa lưu) để xem trước khi cấp phiếu.
 * Không ghi gì vào DB. Chưa lấy số thì in chỗ trống thay cho số PCT.
 */
export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const status: PermitStatus = typeof body.status === "string" && Object.hasOwn(PERMIT_STATUSES, body.status) ? body.status as PermitStatus : "ISSUED";
    const number = typeof body.number === "string" && body.number.trim() ? body.number : "……………";
    const issuerName = typeof body.issuerName === "string" && body.issuerName.trim() ? body.issuerName : user.name ?? "";
    // Xem trước không chặn vì thiếu CHTT/số người; lưu phiếu vẫn kiểm tra đầy đủ như cũ.
    const data = parsePermit({ ...body, number, issuerName }, status === "DRAFT" ? "ISSUED" : status, { allowIncompleteIssue: true });
    if (effectivePermitFormat(data) !== "PAPER") return fail("Chỉ xem trước mẫu cho PCT giấy");
    const safetyItems = await resolvePermitSafety(prisma, { ...body, status: "DRAFT", format: data.format, teamType: data.teamType });
    const buffer = await createWorkPermitDocument({ ...data, safetyItems } as unknown as WorkPermit);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="PCT-xem-truoc.docx"`, "Cache-Control": "private, no-store" } });
  });
}
