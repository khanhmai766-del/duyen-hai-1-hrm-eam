import { prisma } from "@/lib/prisma";
import { fail, requireUser } from "@/lib/api";
import { effectivePermitFormat } from "@/lib/work-permits";
import { permitHandle } from "@/lib/server/work-permits";
import { createWorkPermitDocument, createWorkPermitHtml } from "@/lib/server/work-permit-document";
import { printHtmlResponse } from "@/lib/print-html";
import { permitDocumentBaseName } from "@/lib/server/work-permit-document-store";
export const dynamic = "force-dynamic";
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    await requireUser();
    const row = await prisma.workPermit.findUnique({ where: { id: params.id } });
    if (!row) return fail("Không tìm thấy PCT", 404);
    if (effectivePermitFormat(row) !== "PAPER") return fail("Chỉ xuất mẫu cho PCT giấy");
    if (row.status === "DRAFT" || row.status === "CANCELLED") return fail("Chỉ tải mẫu cho phiếu đã cấp và chưa hủy");
    const base = permitDocumentBaseName(row);
    if (new URL(req.url).searchParams.get("format") === "html") {
      return printHtmlResponse(await createWorkPermitHtml(row), base);
    }
    const buffer = await createWorkPermitDocument(row);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${base}.docx"`, "Cache-Control": "private, no-store" } });
  });
}
