import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireDigitalDocumentPermission } from "@/lib/document-read-access";
import { parseDocumentInput, procedureIdentity } from "@/lib/server/digital-document";
import { lockDocumentCatalog } from "@/lib/server/document-lifecycle";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDigitalDocumentPermission(user, "PROCEDURE", "create");
    const body = await req.json();
    if (!Array.isArray(body.documents) || !body.documents.length || body.documents.length > 500) return fail("Mỗi lần nhập cần từ 1 đến 500 quy trình");
    const inputs = body.documents.map((row: unknown, index: number) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw fail(`Dòng ${index + 1}: dữ liệu không hợp lệ`);
      const input = parseDocumentInput(row as Record<string, unknown>, "PROCEDURE");
      if (input.attachmentUrls.length) throw fail("Nhập Excel chỉ nhận liên kết tài liệu, không nhận ảnh đính kèm");
      return { ...input, attachmentUrls: "[]" };
    });
    const created = await prisma.$transaction(async tx => {
      await lockDocumentCatalog(tx);
      const existing = await tx.digitalDocument.findMany({ where: { category: "PROCEDURE" }, select: { title: true, decisionNumber: true, documentUrl: true } });
      const seen = new Set(existing.map(procedureIdentity)), ids: string[] = [];
      for (const input of inputs) {
        const key = procedureIdentity(input);
        if (seen.has(key)) continue;
        seen.add(key);
        const row = await tx.digitalDocument.create({ data: { ...input, id: randomUUID(), category: "PROCEDURE", createdById: user.id, updatedById: user.id } });
        ids.push(row.id);
      }
      return ids;
    }, { timeout: 60_000 });
    await audit(user.id, "IMPORT_DIGITAL_DOCUMENTS", "DigitalDocument", undefined, `Nhập ${created.length}, bỏ qua ${inputs.length - created.length} quy trình trùng`);
    return ok({ imported: created.length, skipped: inputs.length - created.length });
  });
}
