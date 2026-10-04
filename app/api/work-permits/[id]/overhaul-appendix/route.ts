import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { requirePermitActor } from "@/lib/server/work-permit-permissions";
import { prisma } from "@/lib/prisma";
import { fail, requireUser } from "@/lib/api";
import { effectivePermitFormat } from "@/lib/work-permits";
import { permitHandle } from "@/lib/server/work-permits";
import { createOverhaulAppendixDocument, hasOverhaulAppendix, overhaulAppendixFileName } from "@/lib/server/work-permit-overhaul-appendix";
export const dynamic = "force-dynamic";

/** GET — phụ lục .docx (Mã hạng mục | Nội dung | Biện pháp thi công) in kèm PCT giấy nhà thầu · Đại tu. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitVisible(user, params.id);
    await requirePermitActor(user, params.id);
    const row = await prisma.workPermit.findUnique({ where: { id: params.id } });
    if (!row) return fail("Không tìm thấy PCT", 404);
    if (effectivePermitFormat(row) !== "PAPER") return fail("Chỉ xuất phụ lục cho PCT giấy");
    if (row.status === "DRAFT" || row.status === "CANCELLED") return fail("Chỉ tải phụ lục cho phiếu đã cấp và chưa hủy");
    if (!hasOverhaulAppendix(row)) return fail("Phiếu chưa chọn hạng mục đại tu nào");
    const buffer = createOverhaulAppendixDocument(row);
    const name = overhaulAppendixFileName(row);
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    } });
  });
}
