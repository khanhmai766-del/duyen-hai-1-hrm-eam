"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";
import type { PermitKind } from "@/lib/work-permits";
import type { SafetyItem } from "@/lib/work-permit-safety";
export function usePermitSafety(params: { kind: PermitKind; q: string; page: number; active: string }) {
  const filters = new URLSearchParams(params as unknown as Record<string, string>).toString();
  return useQuery({ queryKey: ["permit-safety", filters], staleTime: 30000,
    queryFn: () => apiGet<SafetyItem[]>(`/api/work-permits/safety?${filters}`) as Promise<{ data: SafetyItem[]; meta: { total: number; pageSize: number; canWrite: boolean } }> });
}
export function useSavePermitSafety() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: unknown }) => apiMutate<SafetyItem>(`/api/work-permits/safety${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permit-safety"] }) });
}
export function useExportPermitTemplate() {
  return useMutation({ mutationFn: (id: string) => apiDownload(`/api/work-permits/${id}/document`) });
}
