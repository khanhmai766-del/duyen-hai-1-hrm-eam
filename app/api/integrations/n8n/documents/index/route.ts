import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyN8nDocumentSyncToken } from "@/lib/document-drive-sync";
import {
  buildDocumentAiIndexVersion,
  documentAiSourcePath,
  isDocumentAiIndexPaused,
  MAX_DOCUMENT_PDF_BYTES,
  prepareDocumentAiContent,
} from "@/lib/document-ai-index";
import { knowledgeEmbeddingText } from "@/lib/ai-knowledge";
import { AI_EMBEDDING_MODEL, embedTexts } from "@/lib/ai-embedding";
import { extractPdfPreview } from "@/lib/tcms/server/pdf/pdf-preview";
import { assertDocumentIndexSource, documentIndexSourceWhere, lockDigitalDocument } from "@/lib/server/document-lifecycle";
import { invalidateAiKnowledgeCache } from "@/lib/ai-knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1_000) : "Lỗi lập chỉ mục không xác định";
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nDocumentSyncToken(req.headers.get("authorization"))) {
      return fail("Không có quyền lập chỉ mục tài liệu", 401);
    }
    // Tạm dừng thì từ chối TRƯỚC mọi bước ghi: không ghi aiIndexError, để mở lại là tài liệu vào hàng ngay.
    if (isDocumentAiIndexPaused()) return fail("Đang tạm dừng lập chỉ mục AI cho tài liệu", 503);

    const documentId = String(req.nextUrl.searchParams.get("documentId") ?? "").trim();
    const driveFileId = String(req.nextUrl.searchParams.get("fileId") ?? "").trim();
    if (!documentId || documentId.length > 100 || !driveFileId || driveFileId.length > 200) {
      return fail("Thiếu documentId hoặc fileId hợp lệ");
    }
    const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/pdf") return fail("Nội dung lập chỉ mục phải là file PDF", 415);
    const declaredSize = Number(req.headers.get("content-length") ?? 0);

    const document = await prisma.digitalDocument.findUnique({ where: { id: documentId } });
    if (!document || document.category !== "PROCEDURE") return fail("Không tìm thấy tài liệu quy trình", 404);
    // Mọi lần từ chối từ đây đều GHI lỗi + lúc thử (11/10/2026): workflow n8n bỏ qua lỗi của bước gửi và luôn chọn tài liệu
    // đầu hàng chưa lỗi — từ chối mà không ghi thì ngày nào cũng gửi lại đúng tài liệu đó (PCT NH3 kẹt 05–11/10/2026).
    const reject = async (message: string, status: number) => {
      await prisma.digitalDocument.updateMany({ where: documentIndexSourceWhere(document),
        data: { aiIndexError: message, aiIndexAttemptedAt: new Date() } }).catch(() => undefined);
      return fail(message, status);
    };
    if (document.driveFileId !== driveFileId) return fail("File Drive không còn khớp với tài liệu", 409);
    if (document.driveSyncStatus !== "SYNCED" || !document.driveFileId) {
      return reject("Tài liệu chưa đồng bộ được file PDF chính", 409);
    }
    if (document.driveMimeType && document.driveMimeType !== "application/pdf") {
      return reject("File Drive đã đồng bộ không phải PDF", 409);
    }
    if (Number.isFinite(declaredSize) && declaredSize > MAX_DOCUMENT_PDF_BYTES) {
      return reject("File PDF vượt quá giới hạn 25 MB", 413);
    }

    const desiredVersion = buildDocumentAiIndexVersion(document);
    if (document.aiIndexVersion === desiredVersion) {
      return ok({ documentId, status: "UNCHANGED", aiIndexVersion: desiredVersion });
    }

    const data = Buffer.from(await req.arrayBuffer());
    if (!data.length) return reject("File PDF đang trống — n8n tải từ Drive về không có nội dung", 400);
    if (data.length > MAX_DOCUMENT_PDF_BYTES) return reject("File PDF vượt quá giới hạn 25 MB", 413);

    try {
      const extraction = await extractPdfPreview(data);
      const prepared = prepareDocumentAiContent(extraction.text, document.title);
      if (!prepared.chunks.length) return reject("Không trích xuất được nội dung chữ từ PDF", 422);

      const vectors = await embedTexts(
        prepared.chunks.map((chunk) => knowledgeEmbeddingText(document.title, chunk)),
        "RETRIEVAL_DOCUMENT",
        { titles: prepared.chunks.map(() => document.title) },
      );
      const sourcePath = documentAiSourcePath(document.id);
      await prisma.$transaction(async tx => {
        assertDocumentIndexSource(await lockDigitalDocument(tx, document.id), document);
        const knowledge = await tx.aiKnowledgeDocument.upsert({
          where: { sourcePath },
          create: {
            id: randomUUID(),
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
        });
        await tx.aiKnowledgeChunk.deleteMany({ where: { documentId: knowledge.id } });
        await tx.aiKnowledgeChunk.createMany({
          data: prepared.chunks.map((chunk, index) => ({
            documentId: knowledge.id,
            chunkIndex: chunk.chunkIndex,
            heading: chunk.heading,
            content: chunk.content,
            embedding: vectors[index],
          })),
        });
        await tx.digitalDocument.update({ where: { id: document.id }, data: {
          aiIndexedAt: new Date(), aiIndexVersion: desiredVersion, aiIndexError: null, aiIndexAttemptedAt: new Date(),
        } });
      }, { timeout: 60_000 });
      invalidateAiKnowledgeCache();

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
      if (error instanceof Response) throw error;
      const message = safeError(error);
      await prisma.digitalDocument.updateMany({ where: documentIndexSourceWhere(document),
        data: { aiIndexError: message, aiIndexAttemptedAt: new Date() } }).catch(() => undefined);
      return fail(`Không thể lập chỉ mục tài liệu: ${message}`, 500);
    }
  });
}
