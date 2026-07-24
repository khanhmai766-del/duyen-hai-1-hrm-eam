"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { Defect } from "@prisma/client";

export interface DefectItem extends Defect {
  createdBy: { id: string; name: string; position: string | null; avatarUrl: string | null };
  fireSafetyImpact: string | null;
  environmentSafetyImpact: string | null;
  relatedDevices: Array<{
    deviceSeq: string;
    device: { seq: string; name: string };
  }>;
}

export function useDefects() {
  return useQuery({
    queryKey: ["defects"],
    queryFn: () => apiGet<DefectItem[]>("/api/defects"),
  });
}

export type DefectInput = Record<string, unknown>;

export function useCreateDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DefectInput) => apiMutate<DefectItem>("/api/defects", "POST", body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["defects"] });
      if (typeof variables.device === "string" && variables.device) {
        qc.invalidateQueries({ queryKey: ["device", variables.device] });
      }
    },
  });
}

export function useUpdateDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DefectInput & { id: string }) => apiMutate<DefectItem>(`/api/defects/${id}`, "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  });
}

export function useDeleteDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/defects/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  });
}

export function useRemindDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<DefectItem>(`/api/defects/${id}/remind`, "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  });
}

export interface DefectSyncResult {
  runId: string;
  readCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  confirmedSkippedCount: number;
  missingCount: number;
  skippedByInterval?: boolean;
}

export function useSyncDefects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiMutate<DefectSyncResult>("/api/defects/sync", "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  });
}

export interface CompleteDefectInput {
  workOrderNumber?: string;
  requestType?: string;
  performedAt?: string | null;
  content?: string;
  result?: string;
  images?: string[];
}

export function useCompleteDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CompleteDefectInput & { id: string }) =>
      apiMutate(`/api/defects/${id}/complete`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defects"] });
      qc.invalidateQueries({ queryKey: ["defect-history"] });
    },
  });
}
