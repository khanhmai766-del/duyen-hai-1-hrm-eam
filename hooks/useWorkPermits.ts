"use client";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";
import type { OverhaulItemOption, OverhaulItemProgress, OverhaulItemSnapshot, OverhaulScheduleLink } from "@/lib/work-permit-overhaul";
import type { PermitHistory, PermitKind, PermitListRow, PermitDetailRow, PermitPerson, PermitRow, PermitStatus, PermitSession } from "@/lib/work-permits";
export interface PermitMeta { total: number; page: number; pageSize: number; counts: Partial<Record<PermitStatus, number>>; overhaulCount: number; canIssue: boolean; canIssueNew: boolean; canExecute: boolean; positionScope?: { all: boolean; codes: string[]; labels: string[] } }
export interface PermitNumberSuggestion { configured: boolean; baseline: string | null; highest: string | null; suggested: string | null }
export interface PermitNumberReservation {
  nkvhPctId?: string | null;
  id: string; kind: string; year: number; number: string; teamType: "INTERNAL" | "CONTRACTOR";
  status: "RESERVED" | "ISSUED" | "CANCELLED" | "RELEASED" | "OBSERVED" | "REVIEW"; ownerId: string; ownerName: string;
  permitId: string | null; reusedPermitId: string | null; createdAt: string;
  /** Lượt lấy từ NKVH: phiếu nháp "Chờ NKVH lưu" mang số này (nếu còn). */
  draftPermitId?: string | null;
}
export interface PermitNumberBaselineRow {
  kind: string; year: number; highest: string; suggested: string | null;
  reusableCancelledNumber: string | null;
  baseline: { number: string; version: number; updatedAt: string } | null;
  history: Array<{ id: string; before: string | null; after: string; reason: string; actorName: string; createdAt: string }>;
  legacyDuplicates: Array<{ number: string; permitIds: string[] }>;
}
export function useWorkPermits(filters: string, enabled = true) {
  return useQuery({ queryKey: ["work-permits", filters], enabled, refetchInterval: 60_000, queryFn: () => apiGet<PermitListRow[]>(`/api/work-permits?${filters}`) as Promise<{ data: PermitListRow[]; meta: PermitMeta }> });
}
export interface PermitLiveSession {
  id: string; commanderId: string | null; commanderCode: string; commanderName: string; company: string; openedAt: string; authorizerName: string;
  permit: Pick<PermitRow, "id" | "number" | "year" | "kind" | "unit" | "content" | "location" | "position" | "teamName" | "progress">;
  /** Nhân viên bổ sung (không kể CHTT) · đang trong khu vực · chưa quét lần nào. */
  workers: number; inside: number; waiting: number;
}
/** Bảng "Đang làm việc": khoá nằm dưới ["work-permits"] nên mọi thao tác mở/kết thúc lần làm việc đều làm mới nó. */
export function usePermitLiveSessions(enabled = true) {
  return useQuery({ queryKey: ["work-permits", "live"], enabled, refetchInterval: 15_000, queryFn: () => apiGet<PermitLiveSession[]>("/api/work-permits/live-sessions") as Promise<{ data: PermitLiveSession[]; meta: { canExecute: boolean } }> });
}
/** Một PCT đại tu đang có lần làm việc mở — màn hình "Tiến độ trong ngày". */
export interface OverhaulTodayRow {
  id: string; commanderName: string; commanderCode: string; openedAt: string; itemProgress: OverhaulItemProgress[] | null;
  permit: { id: string; number: string; year: number; kind: PermitKind; unit: string; content: string; location: string; position: string; teamName: string; version: number; plannedEndAt: string | null; overhaulItems: OverhaulItemSnapshot[] };
  /** % lũy kế gần nhất theo overhaulItemKey. */
  percents: Record<string, number>;
  notes?: Record<string, string>;
}
/** Khoá dưới ["work-permits"]: cập nhật / kết thúc lần làm việc ở nơi khác cũng làm mới danh sách này. */
export function useOverhaulToday() {
  return useQuery({ queryKey: ["work-permits", "overhaul-today"], queryFn: () => apiGet<OverhaulTodayRow[]>("/api/work-permits/overhaul-today") as Promise<{ data: OverhaulTodayRow[]; meta: { canExecute: boolean } }> });
}
/** Bổ sung / bớt hạng mục đại tu của phiếu đã cấp (kể cả đang làm việc). */
export function useSaveOverhaulItems(permitId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { version: number; overhaulItems: OverhaulItemSnapshot[] }) => apiMutate<PermitRow>(`/api/work-permits/${permitId}/overhaul-items`, "POST", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permits"] }); qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["work-permit-overhaul-items"] }); } });
}
/** Ghi tiến độ một phiếu (action "progress"); màn hình gọi tuần tự cho nhiều phiếu rồi tự làm mới một lần. */
export function useOverhaulProgressSave() {
  return useMutation({ mutationFn: ({ permitId, body }: { permitId: string; body: unknown }) => apiMutate<PermitSession>(`/api/work-permits/${permitId}/sessions`, "POST", body) });
}
/** `refetchMs`: màn hình làm việc tự làm mới để nhiều máy (cổng quét, phòng điều khiển) cùng thấy số người trong khu vực. */
export function useWorkPermit(id?: string, refetchMs?: number) {
  return useQuery({ queryKey: ["work-permit", id], queryFn: () => apiGet<PermitDetailRow>(`/api/work-permits/${id}`), enabled: Boolean(id), refetchInterval: refetchMs ?? false });
}
export function useSaveWorkPermit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: unknown }) => apiMutate<PermitRow>(`/api/work-permits${id ? `/${id}` : ""}`, id ? "PUT" : "POST", body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permits"] }); qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["defect"] }); qc.invalidateQueries({ queryKey: ["work-permit-people"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); } });
}
export function useCancelDraftWorkPermit() {
  const qc = useQueryClient();
  // Hủy nháp (không cần lý do) và hủy PCT đã cấp (bắt buộc lý do) dùng chung /cancel.
  return useMutation({ mutationFn: ({ id, version, reason }: { id: string; version: number; reason?: string }) => apiMutate<PermitRow>(`/api/work-permits/${id}/cancel`, "POST", { version, reason }), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permits"] });
    qc.invalidateQueries({ queryKey: ["work-permit"] });
    qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] });
  } });
}
export function useDeleteWorkPermit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
    apiMutate<{ id: string }>(`/api/work-permits/${id}`, "DELETE", { version, reason }), onSuccess: (_data, { id }) => {
    qc.removeQueries({ queryKey: ["work-permit", id], exact: true });
    for (const key of ["work-permits", "work-permit-people", "work-permit-number-suggestion", "work-permit-number-reservations", "work-permit-number-baselines", "defect"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  } });
}
/** Tên CHTT / lãnh đạo công việc đã từng ghi trên PCT nội bộ của sổ — để gợi ý khi cấp phiếu sau.
 *  Khoá nằm dưới ["work-permits"] nên lưu phiếu xong (invalidate ["work-permits"]) là danh sách tự làm mới. */
export function usePermitNameSuggestions(kind: PermitKind, enabled: boolean) {
  return useQuery({ queryKey: ["work-permits", "name-suggestions", kind], enabled, staleTime: 60_000,
    queryFn: () => apiGet<{ commanders: string[]; leaders: string[] }>(`/api/work-permits/name-suggestions?kind=${kind}`) });
}
/** Quản trị xoá hẳn một PCT (bắt buộc lý do). */
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

export interface PermitNumberReviewEntry {
  id: string; number: string; status: string; nkvhPctId: string | null; permitId: string | null; updatedAt: string; ownerName: string;
  /** Phiếu nháp "Chờ NKVH lưu" mang số này (lượt lấy từ NKVH chưa đồng bộ). */
  draftPermitId?: string | null;
}
export function usePermitNumberReview(kind: PermitKind, year: number) {
  return useQuery({ queryKey: ["work-permit-number-review", kind, year], refetchInterval: 15_000,
    queryFn: () => apiGet<{ highest: string; suggested: string | null; total: number; entries: PermitNumberReviewEntry[] }>(`/api/work-permits/number-review?kind=${kind}&year=${year}`) });
}
export function useReviewPermitNumber() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { id: string; action: "confirm" | "ignore"; expectedStatus: string; expectedUpdatedAt: string; reason: string; sourceChecked: boolean }) =>
    apiMutate(`/api/work-permits/number-review`, "POST", body), onSuccess: () => {
      for (const key of ["work-permit-number-review", "work-permit-number-suggestion", "work-permit-number-reservations", "work-permit-number-baselines", "work-permits"]) qc.invalidateQueries({ queryKey: [key] });
    } });
}
export function usePermitNumberReservations(enabled = true) {
  return useQuery({ queryKey: ["work-permit-number-reservations"], enabled, refetchInterval: 5000,
    queryFn: () => apiGet<PermitNumberReservation[]>("/api/work-permits/number-reservations") });
}
export function useTakePermitNumber() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { kind: string; year: number; teamType: string; number?: string }) =>
    apiMutate<PermitNumberReservation>("/api/work-permits/number-reservations", "POST", body),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
}
export function useCancelPermitNumberReservation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) =>
    apiMutate<PermitNumberReservation>(`/api/work-permits/number-reservations/${id}`, "POST", { reason, confirmUnused: true }),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-reservations"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
}
export function usePermitNumberBaselines(year: number, enabled: boolean) {
  return useQuery({ queryKey: ["work-permit-number-baselines", year], enabled,
    queryFn: () => apiGet<PermitNumberBaselineRow[]>(`/api/work-permits/number-baselines?year=${year}`) });
}
export function useSetPermitNumberBaseline() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { kind: string; year: number; number: string; reason: string; version?: number; reuseCancelledNumber?: string }) =>
    apiMutate("/api/work-permits/number-baselines", "PUT", body),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit-number-baselines"] }); qc.invalidateQueries({ queryKey: ["work-permit-number-suggestion"] }); } });
}
export function useExportWorkPermits() {
  return useMutation({ mutationFn: (filters: string) => apiDownload(`/api/work-permits/export?${filters}`) });
}

export function usePermitPeople(params: { q?: string; page?: number; active?: boolean; commander?: boolean; polling?: boolean; company?: string; scope?: string | null; limit?: 25 | 200; enabled?: boolean }) {
  const query = new URLSearchParams({ q: params.q ?? "", page: String(params.page ?? 1), active: params.active ? "1" : "0", commander: params.commander ? "1" : "0",
    ...(params.company ? { company: params.company } : {}), ...(params.scope ? { scope: params.scope } : {}), ...(params.limit ? { limit: String(params.limit) } : {}) });
  return useQuery({ queryKey: ["work-permit-people", query.toString()], enabled: params.enabled ?? true, refetchInterval: params.polling ? 30000 : false, queryFn: () => apiGet<PermitPerson[]>(`/api/work-permits/people?${query}`) as Promise<{ data: PermitPerson[]; meta: { total: number; pageSize: number; canWrite: boolean } }> });
}
/**
 * TOÀN BỘ người của một đơn vị (bảng đơn vị bung ra, danh sách nhân viên của phiếu): máy chủ trả tối đa 200 người
 * một trang nên lấy lần lượt tới hết. Trước 08/10/2026 chỉ lấy trang đầu — đơn vị trên 200 người (IDC 248) mất người
 * cuối danh sách. Khoá nằm dưới ["work-permit-people"] nên thêm / sửa / xoá người vẫn làm mới.
 */
export function usePermitCompanyPeople(company: string, enabled = true) {
  return useQuery({ queryKey: ["work-permit-people", "company-all", company], enabled: enabled && Boolean(company), queryFn: async () => {
    const all: PermitPerson[] = [];
    let meta = { total: 0, pageSize: 200, canWrite: false };
    for (let page = 1; page <= 50; page++) {
      const query = new URLSearchParams({ q: "", page: String(page), active: "0", commander: "0", company, limit: "200" });
      const res = await apiGet<PermitPerson[]>(`/api/work-permits/people?${query}`) as { data: PermitPerson[]; meta: typeof meta };
      all.push(...res.data);
      meta = res.meta;
      if (!res.data.length || all.length >= res.meta.total) break;
    }
    return { data: all, meta };
  } });
}
/** Tra một thẻ vừa quét (link QR hoặc số thẻ) — gọi thẳng, không cache: mỗi lượt quét phải là dữ liệu mới. */
export async function lookupPermitCard(q: string) {
  return (await apiGet<{ code: string; person: PermitPerson | null }>(`/api/work-permits/people/card?q=${encodeURIComponent(q)}`)).data;
}
/** Việc tải ảnh do máy chủ ký ở bước list — chuyển nguyên văn sang bước photos, không sửa. */
export type PermitPhotoJob = { code: string; source: string; exp: number; sig: string };
export interface PermitPeopleSyncResult {
  total: number; created: number; updated: number; skipped: number; skippedSamples: string[];
  skippedTabs: Array<{ tab: string; rows: number }>; moved: string[]; movedCount: number;
  /** Theo đơn vị: mã (= tên tab), tổng người trên sheet, số người mới + tên (tối đa 30). */
  units: Array<{ code: string; company: string; total: number; created: number; createdNames: string[] }>;
  photos: PermitPhotoJob[];
}
export function useSyncPermitPeople() {
  const qc = useQueryClient();
  // meta.background: hộp đồng bộ có thanh tiến độ riêng — không bật lớp chờ toàn trang (AppShell).
  const list = useMutation({ meta: { background: true }, mutationFn: () => apiMutate<PermitPeopleSyncResult>("/api/work-permits/people/sync", "POST", { step: "list" }) });
  const photos = useMutation({ meta: { background: true }, mutationFn: (jobs: PermitPhotoJob[]) =>
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
  outcome: "IN" | "OUT" | "ADDED" | "ALREADY_IN" | "TOO_SOON" | "TOO_SOON_AFTER_OUT"; at: string; inside: number; total: number;
  member: { personId?: string; code: string; name: string; company: string };
}
/** Quét VÀO/RA trong lần làm việc đang mở. Làm mới chi tiết phiếu sau mỗi lượt để danh sách luôn đúng. */
export function usePermitAttendance(permitId: string) {
  const qc = useQueryClient();
  return useMutation({ meta: { background: true },
    mutationFn: (body: { sessionId: string; direction: "auto" | "in" | "out"; personId?: string; index?: number; name?: string }) =>
      apiMutate<PermitAttendanceResult>(`/api/work-permits/${permitId}/sessions/attendance`, "POST", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-permit"] }); qc.invalidateQueries({ queryKey: ["work-permits", "live"] }); qc.invalidateQueries({ queryKey: ["work-permit-people"] }); } });
}

export function usePermitCompanies() {
  return useQuery({ queryKey: ["work-permit-companies"], staleTime: 60000, queryFn: () => apiGet<string[]>("/api/work-permits/companies") });
}
export interface PermitCompanySummary { company: string; code: string; sctx: boolean; overhaul: boolean; total: number; commanders: number; active: number;
  /** Người đang làm việc (CHTT + nhân viên chưa quét RA ở lần làm việc đang mở). */
  working: number }
function invalidateCompanies(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["work-permit-companies"] });
  qc.invalidateQueries({ queryKey: ["work-permit-people"] });
}
/** Thêm một đơn vị nhà thầu (chưa cần có nhân sự). */
export function useCreatePermitCompany() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { name: string; code: string; sctx: boolean; overhaul: boolean }) => apiMutate<{ id: string; name: string; code: string }>("/api/work-permits/companies", "POST", body), onSuccess: () => invalidateCompanies(qc) });
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
    mutationFn: (body: { from: string; to: string; code?: string; sctx?: boolean; overhaul?: boolean }) => apiMutate<{ from: string; to: string; updated: number; merged: number }>("/api/work-permits/companies", "PUT", body),
    onSuccess: () => invalidateCompanies(qc),
  });
}
/** Bảng đơn vị nhà thầu kèm sĩ số, số CHTT và số người đang làm việc — dùng cho tab "Nhân sự nhà thầu". Tự làm mới mỗi phút vì số đang làm việc đổi theo quét vào/ra. */
export function usePermitCompanySummary() {
  return useQuery({ queryKey: ["work-permit-companies", "summary"], staleTime: 30000, refetchInterval: 60000, queryFn: () => apiGet<PermitCompanySummary[]>("/api/work-permits/companies?summary=1") as Promise<{ data: PermitCompanySummary[]; meta: { canWrite: boolean; working: number } }> });
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

export interface PermitResultEntry { id: string; createdAt: string; actorName: string; result: string }
/** Các lần ghi "Kết quả công việc" trước đây (rút từ lịch sử cập nhật của phiếu). */
export function usePermitResults(id: string, version: number) {
  return useQuery({ queryKey: ["work-permit", id, "results", version], staleTime: 60000,
    queryFn: () => apiGet<PermitResultEntry[]>(`/api/work-permits/${id}/results`) });
}

export function useExecuteWorkPermit(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: unknown) => apiMutate<PermitRow>(`/api/work-permits/${id}/execution`, "POST", body), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["work-permits"] });
    qc.invalidateQueries({ queryKey: ["work-permit"] });
    qc.invalidateQueries({ queryKey: ["work-permit-people"] });
  } });
}

export interface OverhaulItemsResult {
  items: OverhaulItemOption[];
  syncedAt: string | null;
  contractorCode: string | null;
  /** Vì sao không có gợi ý: chưa chọn đơn vị ("company") hoặc đơn vị chưa khai mã viết tắt ("companyCode"). */
  reason: "company" | "companyCode" | null;
}
export interface OverhaulSyncResult {
  syncedAt: string;
  sources: Array<{
    source: string; label: string; configured: boolean; file?: string; rows: number; mechanical: number; electrical: number;
    created: number; updated: number; deactivated: number; tabs: string[]; skippedTabs: string[]; unmatchedPositions: string[];
    unknownContractors: string[]; missingContractor: number; error?: string;
  }>;
}
/** Hạng mục đại tu gợi ý cho PCT nhà thầu · Đại tu (đã đồng bộ từ Google Sheets tiến độ). */
export function useOverhaulItems(params: { kind: PermitKind; company: string; position: string; excludePermitId?: string }, enabled: boolean) {
  const search = new URLSearchParams({ kind: params.kind, company: params.company, position: params.position, ...(params.excludePermitId ? { excludePermitId: params.excludePermitId } : {}) }).toString();
  return useQuery({ queryKey: ["work-permit-overhaul-items", search], enabled, staleTime: 60_000,
    queryFn: async () => (await apiGet<OverhaulItemsResult>(`/api/work-permits/overhaul-items?${search}`)).data });
}
export function useSyncOverhaulItems() {
  const qc = useQueryClient();
  return useMutation({ meta: { background: true },
    mutationFn: () => apiMutate<OverhaulSyncResult>("/api/work-permits/overhaul-items/sync", "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-permit-overhaul-items"] });
      qc.invalidateQueries({ queryKey: ["work-permit-overhaul-schedules"] });
    } });
}
/** 4 link Google Sheets tiến độ đại tu (mục "Tiến độ đại tu" của sổ PCT). */
export function useOverhaulSchedules() {
  return useQuery({ queryKey: ["work-permit-overhaul-schedules"], staleTime: 60_000,
    queryFn: () => apiGet<OverhaulScheduleLink[]>("/api/work-permits/overhaul-schedules") as Promise<{ data: OverhaulScheduleLink[]; meta: {
      canWrite: boolean; canSync: boolean;
      /** Số hạng mục gợi ý theo nguồn (BOILER/TURBINE/GENERATOR/CI). */
      items: Record<string, { mechanical: number; electrical: number }>;
      itemsSyncedAt: string | null;
    } }> });
}
export function useSaveOverhaulSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { id: string; title: string; url: string }) => apiMutate<OverhaulScheduleLink>("/api/work-permits/overhaul-schedules", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-permit-overhaul-schedules"] }) });
}
