import type { Prisma } from "@prisma/client";
import type { DocumentDriveSyncRecord } from "@/lib/document-drive-sync";
import { fail } from "@/lib/api";
import { parseGoogleDriveTarget } from "@/lib/google-drive-document";
import { buildDocumentAiIndexVersion } from "@/lib/document-ai-index";
import { EMPTY_DOCUMENT_AI, lockDigitalDocument, removeDocumentKnowledge } from "./document-lifecycle";

export async function applyDocumentDriveSync(tx: Prisma.TransactionClient, record: DocumentDriveSyncRecord) {
  const current = await lockDigitalDocument(tx, record.documentId);
  if (!current || current.category !== "PROCEDURE") return false;
  const source = parseGoogleDriveTarget(current.documentUrl);
  if (source.kind === "UNKNOWN" || (source.kind === "FOLDER" && source.id !== record.driveFolderId)
    || ((source.kind === "FILE" || source.kind === "GOOGLE_DOCUMENT") && source.id !== record.driveFileId
      && !(record.driveSyncStatus === "ERROR" && !record.driveFileId))) {
    throw fail("Link nguồn đã thay đổi; bỏ kết quả đồng bộ cũ và chạy đối soát lại", 409);
  }
  if (record.driveSyncStatus === "SYNCED" && current.driveManualFileId && current.driveManualFileId !== record.driveFileId) {
    throw fail("PDF đã được chọn lại; bỏ kết quả đồng bộ cũ và chạy đối soát lại", 409);
  }
  const changed = record.driveSyncStatus !== "ERROR" && (current.driveFileId !== record.driveFileId
    || buildDocumentAiIndexVersion(current) !== buildDocumentAiIndexVersion(record));
  if (changed) await removeDocumentKnowledge(tx, current.id);
  const { documentId: _id, driveCandidateFiles, ...data } = record;
  await tx.digitalDocument.update({ where: { id: current.id }, data: record.driveSyncStatus === "ERROR"
    ? { driveSyncStatus: record.driveSyncStatus, driveSyncError: record.driveSyncError, driveLastSyncedAt: new Date() }
    : { ...data, driveCandidateFiles: JSON.stringify(driveCandidateFiles), driveLastSyncedAt: new Date(), ...(changed ? EMPTY_DOCUMENT_AI : {}) } });
  return true;
}
