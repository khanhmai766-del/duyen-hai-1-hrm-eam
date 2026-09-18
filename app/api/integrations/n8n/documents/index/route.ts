import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyN8nDocumentSyncToken } from "@/lib/document-drive-sync";
import {
  buildDocumentAiIndexVersion,
  documentAiSourcePath,
  MAX_DOCUMENT_PDF_BYTES,
  prepareDocumentAiContent,
} from "@/lib/document-ai-index";
import { knowledgeEmbeddingText } from "@/lib/ai-knowledge";
import { AI_EMBEDDING_MODEL, embedTexts } from "@/lib/ai-embedding";
import { extractPdfPreview } from "@/lib/tcms/server/pdf/pdf-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ProcedureDocument = {
  id: string;
  title: string;
  driveFileId: string | null;
  driveFileName: string | null;
  driveMimeType: string | null;
  driveModifiedAt: Date | null;
  driveChecksum: string | null;
  driveSyncStatus: string | null;
  aiIndexVersion: string | null;
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1_000) : "Lỗi lập chỉ mục không xác định";
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDocumentSyncToken(req.headers.get("authorization"))) {
      return fail("Không có quyền lập chỉ mục tài liệu", 401);
    }

    const documentId = String(req.nextUrl.searchParams.get("documentId") ?? "").trim();
    const driveFileId = String(req.nextUrl.searchParams.get("fileId") ?? "").trim();
    if (!documentId || documentId.length > 100 || !driveFileId || driveFileId.length > 200) {
      return fail("Thiếu documentId hoặc fileId hợp lệ");
    }
    const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/pdf") return fail("Nội dung lập chỉ mục phải là file PDF", 415);
    const declaredSize = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_DOCUMENT_PDF_BYTES) {
      return fail("File PDF vượt quá giới hạn 25 MB", 413);
    }

    const rows = await prisma.$queryRawUnsafe<ProcedureDocument[]>(`
      SELECT id, title, "driveFileId", "driveFileName", "driveMimeType", "driveModifiedAt",
             "driveChecksum", "driveSyncStatus", "aiIndexVersion"
      FROM "DigitalDocument"
      WHERE id = $1 AND category = 'PROCEDURE'
      LIMIT 1
    `, documentId);
    const document = rows[0];
    if (!document) return fail("Không tìm thấy tài liệu quy trình", 404);
    if (document.driveSyncStatus !== "SYNCED" || !document.driveFileId) {
      return fail("Tài liệu chưa đồng bộ được file PDF chính", 409);
    }
    if (document.driveFileId !== driveFileId) return fail("File Drive không còn khớp với tài liệu", 409);
    if (document.driveMimeType && document.driveMimeType !== "application/pdf") {
      return fail("File Drive đã đồng bộ không phải PDF", 409);
    }

    const desiredVersion = buildDocumentAiIndexVersion(document);
    if (document.aiIndexVersion === desiredVersion) {
      return ok({ documentId, status: "UNCHANGED", aiIndexVersion: desiredVersion });
    }

    const data = Buffer.from(await req.arrayBuffer());
    if (!data.length) return fail("File PDF đang trống");
    if (data.length > MAX_DOCUMENT_PDF_BYTES) return fail("File PDF vượt quá giới hạn 25 MB", 413);

    try {
      const extraction = await extractPdfPreview(data);
      const prepared = prepareDocumentAiContent(extraction.text, document.title);
      if (!prepared.chunks.length) return fail("Không trích xuất được nội dung chữ từ PDF", 422);

      const vectors = await embedTexts(
        prepared.chunks.map((chunk) => knowledgeEmbeddingText(document.title, chunk)),
        "RETRIEVAL_DOCUMENT",
        { titles: prepared.chunks.map(() => document.title) },
      );
      const sourcePath = documentAiSourcePath(document.id);
      const previous = await prisma.aiKnowledgeDocument.findUnique({
        where: { sourcePath },
        select: { id: true },
      });
      const knowledgeDocumentId = previous?.id ?? randomUUID();

      await prisma.$transaction([
        prisma.aiKnowledgeDocument.upsert({
          where: { sourcePath },
          create: {
            id: knowledgeDocumentId,
            sourcePath,
            category: "quy-trinh",
            title: document.title,
            publicUrl: `/api/documents/${encodeURIComponent(document.id)}/open`,
            contentHash: prepared.contentHash,
            embeddingModel: AI_EMBEDDING_MODEL,
            content: prepared.content,
          },
          update: {
            category: "quy-trinh",
            title: document.title,
            publicUrl: `/api/documents/${encodeURIComponent(document.id)}/open`,
            contentHash: prepared.contentHash,
            embeddingModel: AI_EMBEDDING_MODEL,
            content: prepared.content,
          },
        }),
        prisma.aiKnowledgeChunk.deleteMany({ where: { documentId: knowledgeDocumentId } }),
        prisma.aiKnowledgeChunk.createMany({
          data: prepared.chunks.map((chunk, index) => ({
            documentId: knowledgeDocumentId,
            chunkIndex: chunk.chunkIndex,
            heading: chunk.heading,
            content: chunk.content,
            embedding: vectors[index],
          })),
        }),
        prisma.$executeRaw`
          UPDATE "DigitalDocument"
          SET "aiIndexedAt" = CURRENT_TIMESTAMP,
              "aiIndexVersion" = ${desiredVersion},
              "aiIndexError" = NULL
          WHERE id = ${document.id} AND "driveFileId" = ${document.driveFileId}
        `,
      ]);

      return ok({
        documentId,
        status: "INDEXED",
        aiIndexVersion: desiredVersion,
        extraction: extraction.source,
        pageCount: extraction.pageCount,
        textLength: prepared.content.length,
        chunks: prepared.chunks.length,
      });
    } catch (error) {
      const message = safeError(error);
      await prisma.$executeRaw`
        UPDATE "DigitalDocument"
        SET "aiIndexError" = ${message}
        WHERE id = ${document.id}
      `.catch(() => undefined);
      return fail(`Không thể lập chỉ mục tài liệu: ${message}`, 500);
    }
  });
}
