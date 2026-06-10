"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { DefectHistory } from "@prisma/client";

export interface DefectHistoryItem extends DefectHistory {
  createdBy: { id: string; name: string; position: string | null };
}

export interface DefectHistoryFilters {
  system?: string;
  unit?: string;
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

export function useDeleteDefectHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/defect-history/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defect-history"] }),
  });
}
