"use client";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";
import type { PermitHistory, PermitListRow, PermitDetailRow, PermitPerson, PermitRow, PermitStatus, PermitSession } from "@/lib/work-permits";
export interface PermitMeta { total: number; page: number; pageSize: number; counts: Partial<Record<PermitStatus, number>>; canWrite: boolean }
export interface PermitNumberSuggestion { highest: string | null; suggested: string | null }
export function useWorkPermits(filters: string, enabled = true) {
  return useQuery({ queryKey: ["work-permits", filters], enabled, queryFn: () => apiGet<PermitListRow[]>(`/api/work-permits?${filters}`) as Promise<{ data: PermitListRow[]; meta: PermitMeta }> });
}
export function useWorkPermit(id?: string) {
  return useQuery({ queryKey: ["work-permit", id], queryFn: () => apiGet<PermitDetailRow>(`/api/work-permits/${id}`), enabled: Boolean(id) });
}
export function useSaveWorkPermit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: unknown }) => apiMutate<PermitRow>(`/api/work-permits${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permits"] }); qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["work-permit-people"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
}
export function usePermitNumberSuggestion(kind: string, year: number, enabled = true) {
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const query = new URLSearchParams({ kind, year: String(year) });
  return useQuery({
    queryKey: ["work-permit-number-suggestion", kind, year],
    enabled: enabled && Boolean(kind) && validYear,
    staleTime: 0,
    queryFn: () => apiGet<PermitNumberSuggestion>(`/api/work-permits/number-suggestion?${query}`),
  });
}
export function useExportWorkPermits() {
  return useMutation({ mutationFn: (filters: string) => apiDownload(`/api/work-permits/export?${filters}`) });
}

export function usePermitPeople(params: { q?: string; page?: number; active?: boolean; commander?: boolean; polling?: boolean }) {
  const query = new URLSearchParams({ q: params.q ?? "", page: String(params.page ?? 1), active: params.active ? "1" : "0", commander: params.commander ? "1" : "0" });
  return useQuery({ queryKey: ["work-permit-people", query.toString()], refetchInterval: params.polling ? 30000 : false, queryFn: () => apiGet<PermitPerson[]>(`/api/work-permits/people?${query}`) as Promise<{ data: PermitPerson[]; meta: { total: number; canWrite: boolean } }> });
}
export function useSavePermitPerson() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: unknown }) => apiMutate<PermitPerson>(`/api/work-permits/people${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-people"] }); qc.invalidateQueries({ queryKey: ["work-permit-companies"] }); } });
}
export function usePermitSessionAction(permitId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: unknown) => apiMutate<PermitSession>(`/api/work-permits/${permitId}/sessions`, "POST", body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permits"] }); qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["work-permit-people"] }); } });
}

export function usePermitCompanies() {
  return useQuery({ queryKey: ["work-permit-companies"], staleTime: 60000, queryFn: () => apiGet<string[]>("/api/work-permits/companies") });
}

export function usePermitActivity<T>(id: string, type: "sessions" | "history", version: number, enabled: boolean) {
  return useInfiniteQuery({ queryKey: ["work-permit", id, type, version], enabled, initialPageParam: 2,
    queryFn: ({ pageParam }) => apiGet<T[]>(`/api/work-permits/${id}/activity?type=${type}&offset=${pageParam}&version=${version}`) as Promise<{ data: T[]; meta: { nextOffset: number | null } }>,
    getNextPageParam: last => last.meta.nextOffset ?? undefined,
    staleTime: 60000, retry: false,
  });
}
export function usePermitHistoryDetail(permitId: string, historyId: string, enabled: boolean) {
  return useQuery({ queryKey: ["work-permit", permitId, "history-detail", historyId], enabled,
    queryFn: () => apiGet<PermitHistory>(`/api/work-permits/${permitId}/history/${historyId}`), staleTime: Infinity });
}

export function usePermitEmployees(q: string, page: number, enabled: boolean) {
  return useQuery({ queryKey: ["work-permit-employees", q, page], enabled, staleTime: 60000,
    queryFn: () => apiGet<Array<{ id: string; name: string; employeeId: string | null; position: string | null; department: string | null }>>(`/api/work-permits/employees?${new URLSearchParams({ q, page: String(page) })}`) as Promise<{ data: Array<{ id: string; name: string; employeeId: string | null; position: string | null; department: string | null }>; meta: { total: number } }> });
}
