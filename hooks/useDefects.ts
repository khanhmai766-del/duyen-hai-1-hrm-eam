"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { Defect, DefectSyncRun, DefectSyncSetting } from "@prisma/client";

export interface DefectSyncTrafficMetrics {
  todayTotal: number;
  todayUpdate: number;
  todayCreate: number;
  todayRemind: number;
  todaySuccess: number;
  todayFailed: number;
  waiting: number;
  queued: number;
  processing: number;
  queuedUpdate: number;
  queuedCreate: number;
  queuedRemind: number;
  processingUpdate: number;
  processingCreate: number;
  processingRemind: number;
  oldestWaitingAt: string | null;
  averageDurationMs: number | null;
}

export interface DefectTwoWaySyncStatus extends DefectSyncSetting {
  metrics: DefectSyncTrafficMetrics;
  reusableRequestNumbers: Array<{
    id: string;
    requestNumber: string | null;
    requestType: string | null;
    sourceSheetName: string | null;
    createdAt: string;
    cancelledAt: string | null;
    requestNumberReleasedAt: string | null;
  }>;
}

export interface DefectSyncQueueItem {
  id: string;
  defectId: string;
  eventType: "CREATE" | "UPDATE" | "REMIND";
  payload: Record<string, unknown>;
  status: "PENDING" | "PROCESSING" | "FAILED";
  attemptCount: number;
  nextAttemptAt: string;
  claimedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DefectRequestNumberControl {
  defectId: string;
  issuedRequestNumber: string;
  currentRequestNumber: string;
  sheetRequestNumber: string;
  sheetMatchAmbiguous: boolean;
  issuedAt: string | null;
}

export interface DefectItem extends Defect {
  severity2UpgradeCandidate?: boolean;
  severityUpgradeWaitingDays?: number;
  createdBy: { id: string; name: string; position: string | null; avatarUrl: string | null };
  node: { seq: string; name: string } | null;
  fireSafetyImpact: string | null;
  environmentSafetyImpact: string | null;
  relatedDevices: Array<{
    deviceSeq: string;
    mappedUnit: string | null;
    device: { seq: string; name: string };
  }>;
  pendingHistory: {
    startedAt: string;
    finalizeAt: string;
    workOrderNumber: string | null;
    requestType: string | null;
    performedAt: string;
    content: string | null;
    result: string | null;
  } | null;
}

export interface DefectListParams {
  page?: number;
  limit?: number;
  /** "co" | "dien" — chọn Google Sheet nguồn tương ứng (xem lib/defect-section.ts). */
  section?: string;
  unit?: string;
  mappedUnit?: string;
  requestType?: string;
  position?: string;
  mapping?: string;
  status?: string;
  severity?: string;
  repairResult?: string;
  mismatch?: boolean;
  upgradeCandidate?: boolean;
  q?: string;
  deviceSeq?: string;
  includeDescendants?: number;
}

export interface DefectListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  scopeTotal: number;
  upgradeCandidateTotal?: number;
  kpi: {
    chuaXuLy: number;
    coPct: number;
    choVatTu: number;
    choNgungMay: number;
    tonDong: number;
  };
  /** Các giá trị "KQ sửa chữa" thực có trong phạm vi đang xem — dựng danh sách lọc động
   *  vì cột này là chuỗi tự do đồng bộ từ Google Sheet, không phải enum cố định. */
  repairResults?: string[];
  /** Phạm vi cương vị được xem, do server tính (xem lib/position-data-scope.ts).
   *  `all` = xem toàn bộ; ngược lại ô lọc "Cương vị" chỉ bày `labels`. */
  positionScope?: { all: boolean; codes: string[]; labels: string[] };
  /** Các cương vị thực có trong danh sách phiếu, dùng cho tài khoản chỉ tra cứu. */
  availablePositions?: string[];
  /** Số phiếu bị ẩn vì cột Cương vị bỏ trống / ghi nhãn lạ. Chỉ khác 0 với người xem toàn bộ. */
  unmatchedPositionHidden?: number;
}

export interface DefectShiftSummary {
  section: "co" | "dien";
  shiftType: "MORNING" | "AFTERNOON" | "NIGHT";
  shiftLabel: string;
  timeLabel: string;
  start: string;
  end: string;
  issued: number;
  cancelled: number;
  active: number;
  byRequestType: Array<{
    requestType: string;
    issued: number;
    cancelled: number;
    active: number;
  }>;
}

export function useDefectShiftSummary(section: "co" | "dien") {
  return useQuery({
    queryKey: ["defect-shift-summary", section],
    queryFn: () => apiGet<DefectShiftSummary>(`/api/defects/shift-summary?section=${section}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function defectListUrl(params: DefectListParams) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "ALL") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return `/api/defects${suffix ? `?${suffix}` : ""}`;
}

export function useDefects(params: DefectListParams = {}) {
  return useQuery({
    queryKey: ["defects", params],
    queryFn: () => apiGet<DefectItem[]>(defectListUrl(params)) as Promise<{ data: DefectItem[]; meta: DefectListMeta }>,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

export function defectDetailQuery(id: string) {
  return {
    queryKey: ["defect", id] as const,
    queryFn: () => apiGet<DefectItem>(`/api/defects/${encodeURIComponent(id)}`),
    staleTime: 30_000,
  };
}

export function useDefect(id?: string | null) {
  return useQuery({
    ...defectDetailQuery(id ?? ""),
    enabled: Boolean(id),
  });
}

export type DefectInput = Record<string, unknown>;

export function useCreateDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DefectInput) => apiMutate<DefectItem>("/api/defects", "POST", body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["defects"] });
      qc.invalidateQueries({ queryKey: ["defect-shift-summary"] });
      if (typeof variables.device === "string" && variables.device) {
        qc.invalidateQueries({ queryKey: ["device", variables.device] });
      }
      // SYC thay thế: bảng "Chi tiết điểm thay thế" phải hiện chip số yêu cầu ngay.
      if (Array.isArray(variables.replacementIds) && variables.replacementIds.length > 0) {
        qc.invalidateQueries({ queryKey: ["materials"] });
      }
    },
  });
}

export function useUpdateDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DefectInput & { id: string }) => apiMutate<DefectItem>(`/api/defects/${id}`, "PUT", body),
    onSuccess: (updated) => {
      qc.setQueryData(["defect", updated.id], { data: updated, meta: null });
      void qc.invalidateQueries({ queryKey: ["defects"] });
      void qc.invalidateQueries({ queryKey: ["defect-shift-summary"] });
    },
  });
}

export function useDeleteDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/defects/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  });
}

export function useCancelDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiMutate<DefectItem>(`/api/defects/${id}/cancel`, "POST", { note }),
    onSuccess: (updated) => {
      qc.setQueryData(["defect", updated.id], { data: updated, meta: null });
      void qc.invalidateQueries({ queryKey: ["defects"] });
      void qc.invalidateQueries({ queryKey: ["defect-shift-summary"] });
    },
  });
}

export function useRemindDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, shiftLeaderId }: { id: string; shiftLeaderId: string }) =>
      apiMutate<DefectItem>(`/api/defects/${id}/remind`, "POST", { shiftLeaderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  });
}

export interface DefectSyncResult {
  accepted: boolean;
  message: string;
}

export function useDefectSyncStatus(enabled = true) {
  return useQuery({
    queryKey: ["defect-sync-status"],
    queryFn: () => apiGet<DefectSyncRun[]>("/api/defects/sync"),
    enabled,
    refetchInterval: (query) => {
      const latest = query.state.data?.data?.[0];
      return latest?.status === "RUNNING" ? 3_000 : 30_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useSyncDefects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiMutate<DefectSyncResult>("/api/defects/sync", "POST"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["defect-sync-status"] });
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["defect-sync-status"] }), 1_500);
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["defect-sync-status"] }), 4_000);
    },
  });
}

// Cờ dự phòng cho giai đoạn đồng bộ hai chiều (ghi ngược) sau này; hiện chưa có tác vụ
// nào phụ thuộc vào cờ này, chỉ lưu trạng thái bật/tắt cho quản trị/người được phân quyền.
export function useDefectTwoWaySync(enabled = true) {
  return useQuery({
    queryKey: ["defect-two-way-sync"],
    queryFn: () => apiGet<DefectTwoWaySyncStatus>("/api/defects/two-way-sync"),
    enabled,
  });
}

export function useSetDefectTwoWaySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled, pendingAction }: {
      key: "twoWaySyncEnabled" | "operationUpdateEnabled" | "websiteCreateEnabled" | "websiteRemindEnabled";
      enabled: boolean;
      pendingAction?: "resume" | "discard";
    }) => apiMutate<DefectTwoWaySyncStatus>("/api/defects/two-way-sync", "PUT", { key, enabled, pendingAction }),
    onSuccess: (setting) => qc.setQueryData(["defect-two-way-sync"], { data: setting, meta: undefined }),
  });
}

export function useDefectSyncQueue(enabled = true) {
  return useQuery({
    queryKey: ["defect-sync-queue"],
    queryFn: () => apiGet<DefectSyncQueueItem[]>("/api/defects/two-way-sync/queue"),
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useSkipDefectSyncEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, force = false }: { eventId: string; force?: boolean }) =>
      apiMutate<DefectSyncQueueItem>("/api/defects/two-way-sync/queue", "DELETE", { eventId, force }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["defect-sync-queue"] });
      void qc.invalidateQueries({ queryKey: ["defect-two-way-sync"] });
      void qc.invalidateQueries({ queryKey: ["defects"] });
    },
  });
}

export function useDefectRequestNumberControl(id: string, enabled = true) {
  return useQuery({
    queryKey: ["defect-request-number-control", id],
    queryFn: () => apiGet<DefectRequestNumberControl>(`/api/defects/${id}/request-number`),
    enabled: enabled && Boolean(id),
    refetchOnWindowFocus: true,
  });
}

export function useSetDefectRequestNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, requestNumber }: { id: string; requestNumber: string }) =>
      apiMutate<DefectRequestNumberControl>(`/api/defects/${id}/request-number`, "PUT", { requestNumber }),
    onSuccess: (data) => {
      qc.setQueryData(["defect-request-number-control", data.defectId], { data, meta: undefined });
      void qc.invalidateQueries({ queryKey: ["defect", data.defectId] });
      void qc.invalidateQueries({ queryKey: ["defects"] });
      void qc.invalidateQueries({ queryKey: ["defect-sync-queue"] });
    },
  });
}

export interface CompleteDefectInput {
  workOrderNumber?: string;
  requestType?: string;
  performedAt?: string | null;
  content?: string;
  result?: string;
  images?: string[];
  /** SYC thay thế vật tư: ghi lần thay và dời hạn cho các điểm thuộc phiếu. */
  recordReplacement?: boolean;
}

export function useCompleteDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CompleteDefectInput & { id: string }) =>
      apiMutate(`/api/defects/${id}/complete`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defects"] });
      qc.invalidateQueries({ queryKey: ["defect"] });
      qc.invalidateQueries({ queryKey: ["defect-history"] });
      // Danh mục vật tư & lịch thay thế đổi theo khi phiếu ghi nhận đã thay.
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["replacements"] });
      qc.invalidateQueries({ queryKey: ["replacement-history"] });
    },
  });
}

export function useUpdatePendingDefectHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CompleteDefectInput & { id: string }) =>
      apiMutate(`/api/defects/${id}/complete`, "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defects"] });
      qc.invalidateQueries({ queryKey: ["defect"] });
      qc.invalidateQueries({ queryKey: ["defect-history"] });
    },
  });
}
