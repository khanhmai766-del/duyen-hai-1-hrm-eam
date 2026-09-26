"use client";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";
import type { PermitHistory, PermitKind, PermitListRow, PermitDetailRow, PermitPerson, PermitRow, PermitStatus, PermitSession } from "@/lib/work-permits";
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
/** Tên CHTT / lãnh đạo công việc đã từng ghi trên PCT nội bộ của sổ — để gợi ý khi cấp phiếu sau.
 *  Khoá nằm dưới ["work-permits"] nên lưu phiếu xong (invalidate ["work-permits"]) là danh sách tự làm mới. */
export function usePermitNameSuggestions(kind: PermitKind, enabled: boolean) {
  return useQuery({ queryKey: ["work-permits", "name-suggestions", kind], enabled, staleTime: 60_000,
    queryFn: () => apiGet<{ commanders: string[]; leaders: string[] }>(`/api/work-permits/name-suggestions?kind=${kind}`) });
}
/** Quản trị xoá hẳn một PCT (bắt buộc lý do). */
export function useDeleteWorkPermit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) => apiMutate<{ id: string }>(`/api/work-permits/${id}`, "DELETE", { version, reason }), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permits"] });
    qc.invalidateQueries({ queryKey: ["work-permit"] });
    qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] });
    qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] });
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
  return useMutation({ mutationFn: (body: { kind: string; year: number; teamType: string }) =>
    apiMutate<PermitNumberReservation>("/api/work-permits/number-reservations", "POST", body),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
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

export function usePermitPeople(params: { q?: string; page?: number; active?: boolean; commander?: boolean; polling?: boolean; company?: string; limit?: 25 | 200; enabled?: boolean }) {
  const query = new URLSearchParams({ q: params.q ?? "", page: String(params.page ?? 1), active: params.active ? "1" : "0", commander: params.commander ? "1" : "0",
    ...(params.company ? { company: params.company } : {}), ...(params.limit ? { limit: String(params.limit) } : {}) });
  return useQuery({ queryKey: ["work-permit-people", query.toString()], enabled: params.enabled ?? true, refetchInterval: params.polling ? 30000 : false, queryFn: () => apiGet<PermitPerson[]>(`/api/work-permits/people?${query}`) as Promise<{ data: PermitPerson[]; meta: { total: number; pageSize: number; canWrite: boolean } }> });
}
/** Tra một thẻ vừa quét (link QR hoặc số thẻ) — gọi thẳng, không cache: mỗi lượt quét phải là dữ liệu mới. */
export async function lookupPermitCard(q: string) {
  return (await apiGet<{ code: string; person: PermitPerson | null }>(`/api/work-permits/people/card?q=${encodeURIComponent(q)}`)).data;
}
export interface PermitPeopleSyncResult {
  total: number; created: number; updated: number; skipped: number; skippedSamples: string[];
  skippedTabs: Array<{ tab: string; rows: number }>; moved: string[]; movedCount: number;
  photos: Array<{ code: string; source: string }>;
}
export function useSyncPermitPeople() {
  const qc = useQueryClient();
  // meta.background: hộp đồng bộ có thanh tiến độ riêng — không bật lớp chờ toàn trang (AppShell).
  const list = useMutation({ meta: { background: true }, mutationFn: () => apiMutate<PermitPeopleSyncResult>("/api/work-permits/people/sync", "POST", { step: "list" }) });
  const photos = useMutation({ meta: { background: true }, mutationFn: (jobs: Array<{ code: string; source: string }>) =>
    apiMutate<{ results: Array<{ code: string; ok: boolean; error?: string }> }>("/api/work-permits/people/sync", "POST", { step: "photos", jobs }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-permit-people"] }); qc.invalidateQueries({ queryKey: ["work-permit-companies"] }); };
  return { list, photos, refresh };
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

export interface PermitAttendanceResult {
  outcome: "IN" | "OUT" | "ADDED" | "ALREADY_IN" | "TOO_SOON"; at: string; inside: number; total: number;
  member: { personId?: string; code: string; name: string; company: string };
}
/** Quét VÀO/RA trong lần làm việc đang mở. Làm mới chi tiết phiếu sau mỗi lượt để danh sách luôn đúng. */
export function usePermitAttendance(permitId: string) {
  const qc = useQueryClient();
  return useMutation({ meta: { background: true },
    mutationFn: (body: { sessionId: string; direction: "auto" | "in" | "out"; personId?: string; index?: number; name?: string }) =>
      apiMutate<PermitAttendanceResult>(`/api/work-permits/${permitId}/sessions/attendance`, "POST", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["work-permit-people"] }); } });
}

export function usePermitCompanies() {
  return useQuery({ queryKey: ["work-permit-companies"], staleTime: 60000, queryFn: () => apiGet<string[]>("/api/work-permits/companies") });
}
export interface PermitCompanySummary { company: string; code: string; total: number; commanders: number; active: number }
function invalidateCompanies(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["work-permit-companies"] });
  qc.invalidateQueries({ queryKey: ["work-permit-people"] });
}
/** Thêm một đơn vị nhà thầu (chưa cần có nhân sự). */
export function useCreatePermitCompany() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { name: string; code: string }) => apiMutate<{ id: string; name: string; code: string }>("/api/work-permits/companies", "POST", body), onSuccess: () => invalidateCompanies(qc) });
}
/** Xoá đơn vị CHƯA có nhân sự. */
export function useDeletePermitCompany() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name: string) => apiMutate<{ name: string }>(`/api/work-permits/companies?name=${encodeURIComponent(name)}`, "DELETE"), onSuccess: () => invalidateCompanies(qc) });
}
/** Đổi tên một đơn vị nhà thầu (sửa `company` của mọi hồ sơ nhân sự thuộc đơn vị đó). */
export function useRenamePermitCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { from: string; to: string; code?: string }) => apiMutate<{ from: string; to: string; updated: number; merged: number }>("/api/work-permits/companies", "PUT", body),
    onSuccess: () => invalidateCompanies(qc),
  });
}
/** Bảng đơn vị nhà thầu kèm sĩ số và số CHTT — dùng cho tab "Nhân sự nhà thầu". */
export function usePermitCompanySummary() {
  return useQuery({ queryKey: ["work-permit-companies", "summary"], staleTime: 30000, queryFn: () => apiGet<PermitCompanySummary[]>("/api/work-permits/companies?summary=1") as Promise<{ data: PermitCompanySummary[]; meta: { canWrite: boolean } }> });
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
