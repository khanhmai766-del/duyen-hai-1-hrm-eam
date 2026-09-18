import { googleDriveFileViewUrl, normalizeGoogleDriveId } from "@/lib/google-drive-document";
import { verifyBearerToken } from "@/lib/server-token";
import { parseDocumentDriveCandidates, type DocumentDriveCandidate } from "@/lib/document-drive-candidates";

export const DOCUMENT_DRIVE_SYNC_STATUSES = [
  "PENDING",
  "SYNCED",
  "NEEDS_REVIEW",
  "MISSING",
  "ACCESS_DENIED",
  "ERROR",
] as const;

export type DocumentDriveSyncStatus = (typeof DOCUMENT_DRIVE_SYNC_STATUSES)[number];

export type DocumentDriveSyncRecord = {
  documentId: string;
  driveFolderId: string | null;
  driveFileId: string | null;
  driveFileName: string | null;
  driveMimeType: string | null;
  driveModifiedAt: Date | null;
  driveWebViewLink: string | null;
  driveChecksum: string | null;
  driveCandidateFiles: DocumentDriveCandidate[];
  driveSyncStatus: DocumentDriveSyncStatus;
  driveSyncError: string | null;
};

function limitedText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}
function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("driveModifiedTime không hợp lệ");
  return date;
}

export function verifyN8nDocumentSyncToken(authorization: string | null) {
  return verifyBearerToken(authorization, process.env.N8N_DOCUMENT_SYNC_TOKEN);
}

export function parseDocumentDriveSyncRecord(value: unknown): DocumentDriveSyncRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Bản ghi đồng bộ phải là object");
  const input = value as Record<string, unknown>;
  const documentId = limitedText(input.documentId, 200);
  if (!documentId) throw new Error("Thiếu documentId");

  const status = limitedText(input.syncStatus, 40)?.toUpperCase();
  if (!DOCUMENT_DRIVE_SYNC_STATUSES.includes(status as DocumentDriveSyncStatus)) {
    throw new Error(`Trạng thái đồng bộ không hợp lệ cho tài liệu ${documentId}`);
  }

  const driveFolderId = normalizeGoogleDriveId(limitedText(input.driveFolderId, 200));
  const driveFileId = normalizeGoogleDriveId(limitedText(input.driveFileId, 200));
  if (status === "SYNCED" && !driveFileId) throw new Error(`Tài liệu ${documentId} đã đồng bộ nhưng thiếu driveFileId`);

  return {
    documentId,
    driveFolderId,
    driveFileId,
    driveFileName: limitedText(input.driveFileName, 500),
    driveMimeType: limitedText(input.driveMimeType, 200),
    driveModifiedAt: parseDate(input.driveModifiedTime),
    driveWebViewLink: driveFileId ? googleDriveFileViewUrl(driveFileId) : null,
    driveChecksum: limitedText(input.driveChecksum, 200),
    driveCandidateFiles: parseDocumentDriveCandidates(input.candidateFiles),
    driveSyncStatus: status as DocumentDriveSyncStatus,
    driveSyncError: limitedText(input.syncError, 1_000),
  };
}
