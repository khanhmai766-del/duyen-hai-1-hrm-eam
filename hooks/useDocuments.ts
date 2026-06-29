"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type DocumentCategory = "PROCEDURE" | "PID" | "ARCHIVE" | "GRID_SEPARATION" | "STARTUP_DATA" | "BOILER_CALIBRATION" | "MAJOR_REPAIR";

export interface DigitalDocumentUser {
  id: string | null;
  name: string | null;
  position: string | null;
  avatarUrl: string | null;
}

export interface DigitalDocument {
  id: string;
  category: DocumentCategory;
  title: string;
  decisionNumber: string | null;
  issueDate: string | null;
  documentUrl: string;
  managingPosition: string | null;
  managementBlock: string | null;
  procedureType: string | null;
  reason: string | null;
  progress: string | null;
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
  note?: string | null;
  attachmentUrls?: string[];
}

export function useDocuments(category: DocumentCategory) {
  return useQuery({
    queryKey: ["documents", category],
    queryFn: () => apiGet<DigitalDocument[]>(`/api/documents?category=${category}`),
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
