"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface OilAnalysisFailureItem {
  id: string;
  limsId: string;
  soPhieu: string;
  khuVuc: string;
  donVi: string;
  tenMau: string;
  ngayLayMau: string | null;
  danhGia: string | null;
  ykienPkt: string | null;
  ykienQlvh: string | null;
  ngayTraKq: string | null;
  firstSeenAt: string;
  syncedAt: string;
}

export interface OilAnalysisMeta {
  days: number;
  canSync: boolean;
  pendingQlvhCount: number;
}

/** Một dòng đọc từ bảng LIMS — khớp payload tiện ích Chrome gửi về. */
export interface LimsFailureRow {
  limsId: string;
  soPhieu: string;
  khuVuc: string;
  donVi: string;
  tenMau: string;
  ngayLayMau: string;
  danhGia: string;
  ykienPkt: string;
  ykienQlvh: string;
  ngayTraKq: string;
}

export interface OilAnalysisSyncStatus {
  id: string;
  syncedAt: string;
  syncedBy: string;
  position: string | null;
  detail: string | null;
  sourceCount?: number;
  total?: number;
  created?: number;
  updated?: number;
  opinionChanged?: number;
  unchanged?: number;
  skipped?: number;
}

export interface OilAnalysisImportResult {
  total: number;
  created: number;
  updated: number;
  opinionChanged: number;
  unchanged: number;
  skipped: number;
  errors: string[];
  sync: OilAnalysisSyncStatus;
}

export function useOilAnalysisFailures(days = 14) {
  return useQuery({
    queryKey: ["oil-analysis-failures", days],
    queryFn: () => apiGet<OilAnalysisFailureItem[]>(`/api/lims/oil-analysis?days=${days}`),
  });
}

export function useOilAnalysisSyncStatus() {
  return useQuery({
    queryKey: ["oil-analysis-sync-status"],
    queryFn: () => apiGet<OilAnalysisSyncStatus[]>("/api/lims/oil-analysis/import"),
    refetchInterval: 60_000,
  });
}

/** Ghi các mẫu Không Đạt tiện ích đọc được từ LIMS. Upsert theo limsId, không xoá phiếu cũ. */
export function useImportOilAnalysisFromLims() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, sourceCount }: { rows: LimsFailureRow[]; sourceCount?: number }) =>
      apiMutate<OilAnalysisImportResult>("/api/lims/oil-analysis/import", "POST", { rows, sourceCount }),
    onSuccess: (result) => {
      qc.setQueryData<{ data: OilAnalysisSyncStatus[]; meta: unknown }>(["oil-analysis-sync-status"], (current) => ({
        data: [result.sync, ...(current?.data ?? [])].slice(0, 5),
        meta: current?.meta ?? null,
      }));
      // Bản ghi audit đã được API cam kết trước khi trả response; lấy lại ID và
      // thời điểm thực từ server để chip không còn giữ mốc cũ sau lần đồng bộ.
      void qc.invalidateQueries({ queryKey: ["oil-analysis-sync-status"] });
      qc.invalidateQueries({ queryKey: ["oil-analysis-failures"] });
    },
  });
}
