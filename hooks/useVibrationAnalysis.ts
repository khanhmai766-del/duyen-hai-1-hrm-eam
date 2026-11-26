"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { AnalysisDevice, AnalysisSettings } from "@/lib/vibration/analysis/types";
import type { SavedSummary } from "@/lib/vibration/analysis/external";

export interface AnalysisDataset {
  devices: AnalysisDevice[];
  settings: AnalysisSettings;
}

/** Bộ dữ liệu phân tích (thiết bị kèm toàn bộ số đo + mức nền + tham số). scope "rotating" cho Phân tích độ rung, "mill" cho Phân tích độ rung MILL. */
export function useAnalysisDataset(scope: "rotating" | "mill", archived = false) {
  return useQuery({
    queryKey: ["vibration-analysis-dataset", scope, archived],
    queryFn: () => apiGet<AnalysisDataset>(`/api/vibration/analysis/dataset?scope=${scope}${archived ? "&archived=1" : ""}`).then((r) => r.data),
    staleTime: 60_000,
  });
}

/** Lưu tham số phân tích dùng chung. */
export function useSaveAnalysisSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<AnalysisSettings>) => apiMutate<AnalysisSettings>("/api/vibration/analysis/settings", "PUT", { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vibration-analysis-dataset"] }),
  });
}

/** Đặt lại mức nền từ ngày (sau sửa chữa / đại tu) cho một thiết bị; baselineFrom rỗng = bỏ. */
export function useSaveBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { deviceId: string; baselineFrom: string }) => apiMutate<{ deviceId: string; baselineFrom: string }>("/api/vibration/analysis/baseline", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vibration-analysis-dataset"] }),
  });
}

export interface SavedReportDto extends SavedSummary {
  id: string;
  savedAt: string;
  savedBy: string;
  savedById: string | null;
}

/** Phiếu phân tích thiết bị ngoài danh mục đã lưu (mới nhất trước). */
export function useSavedReports() {
  return useQuery({
    queryKey: ["vibration-analysis-reports"],
    queryFn: () => apiGet<SavedReportDto[]>("/api/vibration/analysis/reports").then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useSaveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (summary: SavedSummary) => apiMutate<SavedReportDto & { duplicate: boolean }>("/api/vibration/analysis/reports", "POST", summary),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vibration-analysis-reports"] }),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/vibration/analysis/reports?id=${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vibration-analysis-reports"] }),
  });
}
