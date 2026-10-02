import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { prisma } from "@/lib/prisma";
import { fail, requireUser } from "@/lib/api";
import { effectivePermitFormat } from "@/lib/work-permits";
import { permitHandle } from "@/lib/server/work-permits";
import { permitDocumentBaseName } from "@/lib/server/work-permit-document-store";
import { workPermitQrLabelPng } from "@/lib/server/work-permit-qr";

export const dynamic = "force-dynamic";

/** Tải QR độc lập cho cả phiếu đã cấp trước khi có QR; không tạo lại hay sửa file PCT. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return permitHandle(async () => {
    const { id } = await props.params;
    const user = await requireUser();
    await requirePermitVisible(user, id);
    const row = await prisma.workPermit.findUnique({ where: { id } });
    if (!row) return fail("Không tìm thấy PCT", 404);
    if (row.teamType !== "CONTRACTOR" || effectivePermitFormat(row) !== "PAPER") return fail("Chỉ tải mã QR cho PCT giấy của đơn vị nhà thầu");
    if (["DRAFT", "CANCELLED"].includes(row.status)) return fail("Chỉ tải mã QR cho phiếu đã cấp và chưa hủy");
    const png = await workPermitQrLabelPng(row, new URL(req.url).origin);
    return new Response(new Uint8Array(png), { headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="QR-${permitDocumentBaseName(row)}.png"`,
      "Cache-Control": "private, no-store",
    } });
  });
}
