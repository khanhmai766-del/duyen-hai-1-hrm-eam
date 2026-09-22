"use client";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";
import type { PermitHistory, PermitListRow, PermitDetailRow, PermitPerson, PermitRow, PermitStatus, PermitSession } from "@/lib/work-permits";
export interface PermitMeta { total: number; page: number; pageSize: number; counts: Partial<Record<PermitStatus, number>>; canIssue: boolean; canExecute: boolean }
export interface PermitNumberSuggestion { configured: boolean; baseline: string | null; highest: string | null; suggested: string | null }
export interface PermitNumberReservation {
  id: string; kind: string; year: number; number: string; teamType: "INTERNAL" | "CONTRACTOR";
  status: "RESERVED" | "ISSUED" | "CANCELLED"; ownerId: string; ownerName: string;
  permitId: string | null; reusedPermitId: string | null; createdAt: string;
}
export interface PermitNumberBaselineRow {
  kind: string; year: number; highest: string; suggested: string | null;
  baseline: { number: string; version: number; updatedAt: string } | null;
  history: Array<{ id: string; before: string | null; after: string; reason: string; actorName: string; createdAt: string }>;
  legacyDuplicates: Array<{ number: string; permitIds: string[] }>;
}
export function useWorkPermits(filters: string, enabled = true) {
  return useQuery({ queryKey: ["work-permits", filters], enabled, refetchInterval: 60_000, queryFn: () => apiGet<PermitListRow[]>(`/api/work-permits?${filters}`) as Promise<{ data: PermitListRow[]; meta: PermitMeta }> });
}
export function useWorkPermit(id?: string) {
  return useQuery({ queryKey: ["work-permit", id], queryFn: () => apiGet<PermitDetailRow>(`/api/work-permits/${id}`), enabled: Boolean(id) });
}
export function useSaveWorkPermit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: unknown }) => apiMutate<PermitRow>(`/api/work-permits${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permits"] }); qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["defect"] }); qc.invalidateQueries({ queryKey: ["work-permit-people"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); } });
}
export function useCancelDraftWorkPermit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, version }: { id: string; version: number }) => apiMutate<PermitRow>(`/api/work-permits/${id}/cancel`, "POST", { version }), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permits"] });
    qc.invalidateQueries({ queryKey: ["work-permit"] });
    qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] });
  } });
}
export function useSaveNkvhPermitLink(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { version: number; nkvhPctId: string | null }) => apiMutate<PermitRow>(`/api/work-permits/${id}/nkvh-link`, "PATCH", body), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permits"] });
    qc.invalidateQueries({ queryKey: ["work-permit"] });
    qc.invalidateQueries({ queryKey: ["defect"] });
  } });
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
export function usePermitNumberReservations(enabled = true) {
  return useQuery({ queryKey: ["work-permit-number-reservations"], enabled,
    queryFn: () => apiGet<PermitNumberReservation[]>("/api/work-permits/number-reservations") });
}
export function useTakePermitNumber() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { kind: string; year: number; teamType: string; number?: string; reissueAcknowledged?: boolean }) =>
    apiMutate<PermitNumberReservation>("/api/work-permits/number-reservations", "POST", body),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
}
export function usePermitNumberAvailability(kind: string, year: number, number: string, enabled: boolean) {
  return useQuery({ queryKey: ["work-permit-number-availability", kind, year, number],
    enabled: enabled && /^[0-9]+$/.test(number), staleTime: 0,
    queryFn: () => apiGet<{ number: string; configured: boolean; active: boolean; eligible: boolean; cancelledReservation: boolean;
      cancelledPermits: Array<{ id: string; number: string; content: string; teamType: string; updatedAt: string }> }>(
      `/api/work-permits/number-availability?${new URLSearchParams({ kind, year: String(year), number })}`),
  });
}
export function useCancelPermitNumberReservation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) =>
    apiMutate<PermitNumberReservation>(`/api/work-permits/number-reservations/${id}`, "POST", { reason }),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
}
export function usePermitNumberBaselines(year: number, enabled: boolean) {
  return useQuery({ queryKey: ["work-permit-number-baselines", year], enabled,
    queryFn: () => apiGet<PermitNumberBaselineRow[]>(`/api/work-permits/number-baselines?year=${year}`) });
}
export function useSetPermitNumberBaseline() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { kind: string; year: number; number: string; reason: string; version?: number }) =>
    apiMutate("/api/work-permits/number-baselines", "PUT", body),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-baselines"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
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
export function useDeletePermitPerson() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, version }: { id: string; version: number }) => apiMutate<{ id: string }>(`/api/work-permits/people/${id}`, "DELETE", { version }), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permit-people"] });
    qc.invalidateQueries({ queryKey: ["work-permit-companies"] });
  } });
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

export function useExecuteWorkPermit(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: unknown) => apiMutate<PermitRow>(`/api/work-permits/${id}/execution`, "POST", body), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permits"] });
    qc.invalidateQueries({ queryKey: ["work-permit"] });
    qc.invalidateQueries({ queryKey: ["work-permit-people"] });
  } });
}
