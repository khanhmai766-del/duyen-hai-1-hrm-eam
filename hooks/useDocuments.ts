"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type DocumentCategory =
  | "PROCEDURE"
  | "PID"
  | "ARCHIVE"
  | "GRID_SEPARATION"
  | "STARTUP_DATA"
  | "BOILER_CALIBRATION"
  | "OIL_GUN_DATA";

export interface DigitalDocumentUser {
  id: string | null;
  name: string | null;
  position: string | null;
  avatarUrl: string | null;
}

export interface DocumentDriveCandidate {
  id: string;
  name: string;
  mimeType: "application/pdf";
  modifiedTime: string | null;
  md5Checksum: string | null;
  webViewLink: string;
  size: number | null;
}

export interface DigitalDocument {
  id: string;
  category: DocumentCategory;
  title: string;
  decisionNumber: string | null;
  issueDate: string | null;
  documentUrl: string;
  driveFolderId: string | null;
  driveFileId: string | null;
  driveFileName: string | null;
  driveMimeType: string | null;
  driveModifiedAt: string | null;
  driveWebViewLink: string | null;
  driveChecksum: string | null;
  driveCandidateFiles: DocumentDriveCandidate[];
  driveManualFileId: string | null;
  driveSyncStatus: string | null;
  driveSyncError: string | null;
  driveLastSyncedAt: string | null;
  aiIndexedAt: string | null;
  aiIndexVersion: string | null;
  aiIndexError: string | null;
  managingPosition: string | null;
  managementBlock: string | null;
  procedureType: string | null;
  reason: string | null;
  progress: string | null;
  /** Bản bóc tách có cấu trúc của `progress` (JSON). Rỗng = chưa bóc tách. */
  timelineJson: string | null;
  note: string | null;
  attachmentUrls: string[];
  createdBy?: DigitalDocumentUser | null;
  updatedBy?: DigitalDocumentUser | null;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalDocumentInput {
  id?: string;
  category: DocumentCategory;
  title: string;
  decisionNumber?: string | null;
  issueDate?: string | null;
  documentUrl: string;
  managingPosition?: string | null;
  managementBlock?: string | null;
  procedureType?: string | null;
  reason?: string | null;
  progress?: string | null;
  timelineJson?: string | null;
  note?: string | null;
  attachmentUrls?: string[];
}

export function useDocuments(category: DocumentCategory) {
  return useQuery({
    queryKey: ["documents", category],
    queryFn: () => apiGet<DigitalDocument[]>(`/api/documents?category=${category}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DigitalDocumentInput) =>
      apiMutate<DigitalDocument>("/api/documents", body.id ? "PUT" : "POST", body),
    onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ["documents", variables.category] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: DocumentCategory }) =>
      apiMutate<{ id: string }>(`/api/documents?id=${id}&category=${category}`, "DELETE"),
    onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ["documents", variables.category] }),
  });
}

export function useSelectDocumentDriveFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, fileId }: { documentId: string; fileId: string }) =>
      apiMutate<{ documentId: string; driveFileId: string; driveFileName: string; driveSyncStatus: "SYNCED" }>(
        `/api/documents/${encodeURIComponent(documentId)}/select-drive-file`,
        "PUT",
        { fileId },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", "PROCEDURE"] }),
  });
}
