import type { DigitalDocument, Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { documentAiSourcePath, buildDocumentAiIndexVersion } from "@/lib/document-ai-index";

export const EMPTY_DOCUMENT_AI = { aiIndexedAt: null, aiIndexVersion: null, aiIndexError: null, aiIndexAttemptedAt: null };
export const EMPTY_DOCUMENT_DRIVE = {
  driveFolderId: null, driveFileId: null, driveFileName: null, driveMimeType: null,
  driveModifiedAt: null, driveWebViewLink: null, driveChecksum: null, driveCandidateFiles: null,
  driveManualFileId: null, driveSyncStatus: "PENDING", driveSyncError: null, driveLastSyncedAt: null,
};

/** Mọi đường sửa nguồn, chọn PDF, đồng bộ, xoá và chốt chỉ mục dùng cùng khoá dòng. */
export async function lockDigitalDocument(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "DigitalDocument" WHERE "id" = ${id} FOR UPDATE`;
  return tx.digitalDocument.findUnique({ where: { id } });
}

export async function lockDocumentCatalog(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('digital-document-catalog'))::text`;
}

export async function removeDocumentKnowledge(tx: Prisma.TransactionClient, id: string) {
  await tx.aiKnowledgeDocument.deleteMany({ where: { sourcePath: documentAiSourcePath(id) } });
}

export type DocumentIndexSource = Pick<DigitalDocument, "id" | "title" | "documentUrl" | "driveFileId" | "driveModifiedAt" | "driveChecksum" | "driveSyncStatus">;

export function assertDocumentIndexSource(current: DocumentIndexSource | null, expected: DocumentIndexSource) {
  if (!current || current.driveSyncStatus !== "SYNCED" || current.driveFileId !== expected.driveFileId
    || current.documentUrl !== expected.documentUrl || current.title !== expected.title
    || buildDocumentAiIndexVersion(current) !== buildDocumentAiIndexVersion(expected)) {
    throw fail("Nguồn tài liệu đã thay đổi; bỏ kết quả cũ và chờ đồng bộ lại", 409);
  }
}

/** Ghi lỗi có điều kiện để lần nạp cũ không đè trạng thái của nguồn mới. */
export function documentIndexSourceWhere(source: DocumentIndexSource): Prisma.DigitalDocumentWhereInput {
  return { id: source.id, title: source.title, documentUrl: source.documentUrl, driveFileId: source.driveFileId,
    driveModifiedAt: source.driveModifiedAt, driveChecksum: source.driveChecksum, driveSyncStatus: source.driveSyncStatus };
}
