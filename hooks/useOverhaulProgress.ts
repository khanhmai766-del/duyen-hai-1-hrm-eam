"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { OverhaulGridDay, OverhaulGridRow } from "@/lib/overhaul-progress-grid";

export type OverhaulProgressTab = { source: string; sourceLabel: string; sheet: string; kind: string; items: number };

/** Danh sách file → tab tiến độ đại tu (trang /tien-ich/tien-do-dai-tu). */
export function useOverhaulProgressTabs() {
  return useQuery({ queryKey: ["overhaul-progress", "tabs"], staleTime: 5 * 60_000, refetchOnWindowFocus: false,
    queryFn: () => apiGet<OverhaulProgressTab[]>("/api/overhaul-progress") as Promise<{ data: OverhaulProgressTab[]; meta: { syncedAt: string | null } }> });
}

/**
 * Bảng tiến độ của một tab trong cửa sổ ngày `from…to` (nhật ký rút gọn). Không tự tải lại khi quay lại tab trình duyệt
 * (tránh tải lặp); làm mới mỗi 3 phút khi trang đang mở + nút "Tải lại". Đổi cửa sổ ngày giữ bảng cũ tới khi có dữ liệu mới.
 */
export function useOverhaulProgress(source: string, sheet: string, from: string, to: string) {
  const search = new URLSearchParams({ source, sheet, from, to }).toString();
  return useQuery({ queryKey: ["overhaul-progress", "grid", search], enabled: Boolean(source && sheet), staleTime: 60_000,
    refetchOnWindowFocus: false, refetchInterval: 3 * 60_000, placeholderData: keepPreviousData,
    queryFn: () => apiGet<OverhaulGridRow[]>(`/api/overhaul-progress?${search}`) as Promise<{ data: OverhaulGridRow[]; meta: { syncedAt: string | null } }> });
}

/** Nhật ký đầy đủ của một ô (bảng chỉ gửi bản rút gọn). */
export function useOverhaulProgressCell(source: string, sheet: string, code: string, day: string, enabled: boolean) {
  const search = new URLSearchParams({ source, sheet, code, day }).toString();
  return useQuery({ queryKey: ["overhaul-progress", "cell", search], enabled, staleTime: 60_000, refetchOnWindowFocus: false,
    queryFn: async () => (await apiGet<OverhaulGridDay | null>(`/api/overhaul-progress?${search}`)).data });
}
