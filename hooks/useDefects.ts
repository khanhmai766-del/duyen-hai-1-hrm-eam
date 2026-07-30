"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { Defect, DefectSyncRun, DefectSyncSetting } from "@prisma/client";

export interface DefectItem extends Defect {
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
  unit?: string;
  mappedUnit?: string;
  requestType?: string;
  position?: string;
  mapping?: string;
  status?: string;
  severity?: string;
  repairResult?: string;
  mismatch?: boolean;
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
    onSuccess: (updated) => {
      qc.setQueryData(["defect", updated.id], { data: updated, meta: null });
      void qc.invalidateQueries({ queryKey: ["defects"] });
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
    queryFn: () => apiGet<DefectSyncSetting>("/api/defects/two-way-sync"),
    enabled,
  });
}

export function useSetDefectTwoWaySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => apiMutate<DefectSyncSetting>("/api/defects/two-way-sync", "PUT", { enabled }),
    onSuccess: (setting) => qc.setQueryData(["defect-two-way-sync"], { data: setting, meta: undefined }),
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
      qc.invalidateQueries({ queryKey: ["defect"] });
      qc.invalidateQueries({ queryKey: ["defect-history"] });
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
