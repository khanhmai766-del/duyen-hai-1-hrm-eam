"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { Defect } from "@prisma/client";

export interface DefectItem extends Defect {
  createdBy: { id: string; name: string; position: string | null };
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
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

export interface CompleteDefectInput {
  workOrderNumber?: string;
  performedAt?: string | null;
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
