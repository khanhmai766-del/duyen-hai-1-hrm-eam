import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requireDigitalDocumentPermission } from "@/lib/document-read-access";
import { documentCategory, documentWriteData, parseDocumentInput, procedureIdentity, publicDigitalDocuments } from "@/lib/server/digital-document";
import { EMPTY_DOCUMENT_AI, EMPTY_DOCUMENT_DRIVE, lockDigitalDocument, lockDocumentCatalog, removeDocumentKnowledge } from "@/lib/server/document-lifecycle";
import { invalidateAiKnowledgeCache } from "@/lib/ai-knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(), category = documentCategory(req.nextUrl.searchParams.get("category"));
    await requireDigitalDocumentPermission(user, category, "read");
    const rows = await prisma.digitalDocument.findMany({ where: { category }, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }] });
    return ok(await publicDigitalDocuments(prisma, rows));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(), body = await req.json(), category = documentCategory(body.category);
    await requireDigitalDocumentPermission(user, category, "create");
    const data = await documentWriteData(parseDocumentInput(body, category));
    const row = await prisma.$transaction(async tx => {
      await lockDocumentCatalog(tx);
      if (category === "PROCEDURE" && (await tx.digitalDocument.findMany({ where: { category },
        select: { title: true, decisionNumber: true, documentUrl: true } })).some(row => procedureIdentity(row) === procedureIdentity(data))) throw fail("Quy trình này đã có trong danh mục", 409);
      return tx.digitalDocument.create({ data: { ...data, id: randomUUID(), category, createdById: user.id, updatedById: user.id } });
    });
    await audit(user.id, "CREATE_DIGITAL_DOCUMENT", "DigitalDocument", row.id, row.title);
    return ok((await publicDigitalDocuments(prisma, [row]))[0]);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(), body = await req.json(), category = documentCategory(body.category);
    const id = String(body.id ?? "").trim();
    if (!id) return fail("Thiếu id tài liệu");
    await requireDigitalDocumentPermission(user, category, "manage");
    const data = await documentWriteData(parseDocumentInput(body, category));
    const row = await prisma.$transaction(async tx => {
      await lockDocumentCatalog(tx);
      const current = await lockDigitalDocument(tx, id);
      if (!current || current.category !== category) throw fail("Không tìm thấy tài liệu", 404);
      const sourceChanged = current.documentUrl !== data.documentUrl;
      const aiChanged = sourceChanged || current.title !== data.title;
      if (category === "PROCEDURE" && (await tx.digitalDocument.findMany({ where: { category, id: { not: id } },
        select: { title: true, decisionNumber: true, documentUrl: true } })).some(row => procedureIdentity(row) === procedureIdentity(data))) throw fail("Quy trình này đã có trong danh mục", 409);
      if (aiChanged) await removeDocumentKnowledge(tx, id);
      return tx.digitalDocument.update({ where: { id }, data: { ...data,
        ...(sourceChanged ? { ...EMPTY_DOCUMENT_DRIVE, driveSyncStatus: category === "PROCEDURE" ? "PENDING" : null } : {}), ...(aiChanged ? EMPTY_DOCUMENT_AI : {}),
        updatedById: user.id, updatedAt: new Date() } });
    });
    invalidateAiKnowledgeCache();
    await audit(user.id, "UPDATE_DIGITAL_DOCUMENT", "DigitalDocument", id, row.title);
    return ok((await publicDigitalDocuments(prisma, [row]))[0]);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(), category = documentCategory(req.nextUrl.searchParams.get("category"));
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return fail("Thiếu id tài liệu");
    await requireDigitalDocumentPermission(user, category, "delete");
    await prisma.$transaction(async tx => {
      const current = await lockDigitalDocument(tx, id);
      if (!current || current.category !== category) throw fail("Không tìm thấy tài liệu", 404);
      await removeDocumentKnowledge(tx, id);
      await tx.digitalDocument.delete({ where: { id } });
    });
    invalidateAiKnowledgeCache();
    await audit(user.id, "DELETE_DIGITAL_DOCUMENT", "DigitalDocument", id);
    return ok({ id });
  });
}
