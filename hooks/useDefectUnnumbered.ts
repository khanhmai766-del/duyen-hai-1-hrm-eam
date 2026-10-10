"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DefectUnnumberedRow } from "@prisma/client";
import { apiGet, apiMutate } from "@/lib/fetcher";

/** Dòng khiếm khuyết chưa có STT trên Sheet — xem app/api/defects/unnumbered/route.ts. */
export type DefectUnnumberedSource = "CO" | "DIEN";
export type DefectUnnumberedStatus = "CHUA_XU_LY" | "CO_PCT" | "CHO_VAT_TU" | "CHO_NGUNG_MAY" | "DA_XU_LY";
export type DefectUnnumberedItem = Omit<DefectUnnumberedRow, "lastReadAt" | "updatedAt"> & {
  sheetStatus: DefectUnnumberedStatus;
  suggestedStatus: DefectUnnumberedStatus | null;
  lastReadAt: string;
  updatedAt: string | null;
};
export type DefectUnnumberedMeta = { lastReadAt: string | null; canEdit: boolean; label: string };

const key = (source: DefectUnnumberedSource) => ["defect-unnumbered", source] as const;

export function useDefectUnnumbered(source: DefectUnnumberedSource, enabled = true) {
  return useQuery({
    queryKey: key(source),
    queryFn: () => apiGet<DefectUnnumberedItem[]>(`/api/defects/unnumbered?source=${source}`) as Promise<{ data: DefectUnnumberedItem[]; meta: DefectUnnumberedMeta }>,
    enabled,
  });
}

export function useRefreshDefectUnnumbered(source: DefectUnnumberedSource) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => apiMutate<{ skipped: boolean; count: number | null }>("/api/defects/unnumbered", "POST", { source, force }),
    onSuccess: () => client.invalidateQueries({ queryKey: key(source) }),
  });
}

export function useWriteDefectUnnumbered(source: DefectUnnumberedSource) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: Array<{ id: string; status: DefectUnnumberedStatus }>) =>
      apiMutate<{ written: number }>("/api/defects/unnumbered", "PUT", { source, changes }),
    // Lỗi 409 (dòng đã đổi trên Sheet) cũng cần tải lại để người dùng thấy dữ liệu mới.
    onSettled: () => client.invalidateQueries({ queryKey: key(source) }),
  });
}
