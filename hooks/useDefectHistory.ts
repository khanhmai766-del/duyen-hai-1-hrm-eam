"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { DefectHistory } from "@prisma/client";

export interface DefectHistoryItem extends DefectHistory {
  createdBy: { id: string; name: string; position: string | null; avatarUrl?: string | null };
}

export interface DefectHistoryFilters {
  system?: string;
  unit?: string;
  workOrderNumber?: string;
  device?: string;
  from?: string;
  to?: string;
}

export function useDefectHistory(filters: DefectHistoryFilters = {}) {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  return useQuery({
    queryKey: ["defect-history", filters],
    queryFn: () => apiGet<DefectHistoryItem[]>(`/api/defect-history?${qs.toString()}`),
  });
}

export function useCreateDefectHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiMutate<DefectHistoryItem>("/api/defect-history", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defect-history"] }),
  });
}

export function useUpdateDefectHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown> & { id: string }) =>
      apiMutate<DefectHistoryItem>(`/api/defect-history/${id}`, "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defect-history"] }),
  });
}

export function useDeleteDefectHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/defect-history/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defect-history"] }),
  });
}
