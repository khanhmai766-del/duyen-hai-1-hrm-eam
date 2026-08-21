"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { DefectHistory } from "@prisma/client";

export interface DefectHistoryItem extends DefectHistory {
  historyStatus?: "FINALIZED" | "PENDING";
  finalizeAt?: string | null;
  pendingDefectId?: string | null;
  createdBy: { id: string; name: string; position: string | null; avatarUrl?: string | null };
  relatedDevices: Array<{
    deviceSeq: string;
    mappedUnit: string | null;
    device: { seq: string; name: string };
  }>;
  /** Tên thiết bị lấy thẳng từ cây — khỏi phải tải cả danh mục để tra mã → tên. */
  node?: { seq: string; name: string } | null;
}

export interface DefectHistoryFilters {
  position?: string;
  /** @deprecated Dùng position; giữ lại để tương thích liên kết cũ. */
  system?: string;
  unit?: string;
  /** Cơ | Điện | … — lọc ngay trong SQL, không để trần HISTORY_TAKE cắt trước. */
  requestType?: string;
  mappedUnit?: string;
  workOrderNumber?: string;
  device?: string;
  deviceSeq?: string;
  includeDescendants?: string;
  /** Giới hạn số dòng cho các khối tra cứu nhanh, ví dụ lúc ra phiếu. */
  limit?: string;
  from?: string;
  to?: string;
  status?: "PENDING" | "FINALIZED";
  page?: string;
  pageSize?: string;
  search?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

export function useDefectHistory(filters: DefectHistoryFilters = {}) {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  return useQuery({
    queryKey: ["defect-history", filters],
    queryFn: () => apiGet<DefectHistoryItem[]>(`/api/defect-history?${qs.toString()}`),
    // Giữ nguyên bảng và ô tìm kiếm trong lúc truy vấn ký tự tiếp theo. Nếu trả
    // về trạng thái loading trắng, cả Card bị tháo khỏi DOM và ô nhập mất focus.
    placeholderData: (previous) => previous,
  });
}

export interface ReopenPendingDefectResult {
  id: string;
  status: string;
  syncQueued: boolean;
  materialReversal: { removed: number; restored: number; skipped: number } | null;
}

export function useReopenPendingDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiMutate<ReopenPendingDefectResult>(`/api/defects/${id}/reopen`, "POST", { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defect-history"] });
      qc.invalidateQueries({ queryKey: ["defects"] });
      qc.invalidateQueries({ queryKey: ["defect"] });
      qc.invalidateQueries({ queryKey: ["defect-shift-summary"] });
      qc.invalidateQueries({ queryKey: ["defect-sync-status"] });
      qc.invalidateQueries({ queryKey: ["defect-two-way-sync"] });
      qc.invalidateQueries({ queryKey: ["defect-sync-queue"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["replacements"] });
      qc.invalidateQueries({ queryKey: ["replacement-history"] });
    },
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
