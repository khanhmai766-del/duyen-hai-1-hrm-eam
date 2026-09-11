import { prisma } from "@/lib/prisma";
import { fail, requireUser } from "@/lib/api";
import { effectivePermitFormat } from "@/lib/work-permits";
import { permitHandle } from "@/lib/server/work-permits";
import { createWorkPermitDocument } from "@/lib/server/work-permit-document";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    await requireUser();
    const row = await prisma.workPermit.findUnique({ where: { id: params.id } });
    if (!row) return fail("Không tìm thấy PCT", 404);
    if (effectivePermitFormat(row) !== "PAPER") return fail("Chỉ điền mẫu Word cho PCT giấy");
    if (row.status === "DRAFT" || row.status === "CANCELLED") return fail("Chỉ tải mẫu cho phiếu đã cấp và chưa hủy");
    const buffer = await createWorkPermitDocument(row);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="PCT-${row.kind === "MECHANICAL" ? "Co" : "Dien"}-${row.year}-${row.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.docx"`, "Cache-Control": "private, no-store" } });
  });
}
