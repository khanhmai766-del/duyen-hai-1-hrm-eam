"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { mergeDailyInputsWithCtktkt } from "@/modules/ctktkt/lib/daily-source-links";
import { loadReportPeriods, reportPeriodQuery } from "@/modules/ctktkt/lib/report-loading";
import type { PpaSourceData, PpaResult } from "@/modules/ctktkt/lib/ppa-heat-rate";
import type { GoogleSheetDayPayload } from "@/modules/ctktkt/lib/google-sheet-sync";
import { periodsBetween, useInvalidateKtkt, type DailyInputEntry } from "@/hooks/useKtktDailyInputs";

/** Một ngày kết quả PPA đã lưu — đúng các cột GET /api/ctktkt/ppa-heat-rate trả về. */
export type StoredPpaEntry = {
  operatingDate: string; sourceFiles: string;
  grossS1Kwh: string; netS1Kwh: string; grossS2Kwh: string; netS2Kwh: string;
  ppaPlant: string; ppaS1: string; ppaS2: string; noteS1: string; noteS2: string; updatedAt: string;
};
export type StoredPpaWithSource = StoredPpaEntry & { source: PpaSourceData | null };
type CtktktLinkedEntry = { operatingDate: string; cell: string; value: string };
export type PpaRangeData = { ppa: StoredPpaEntry[]; daily: DailyInputEntry[] };

const ppaRangeKey = (from: string, to: string) => ["ctktkt", "ppa-range", from, to] as const;

/**
 * Tab So sánh trực quan: kết quả PPA + dữ liệu ngày (đã gộp ô liên kết Chỉ tiêu KTKT) cho khoảng [from, to].
 * Tải lần lượt từng tháng, mỗi tháng gọi song song 3 API — như bản cũ. Không lọc theo ngày: trang tự lọc
 * theo khoảng đang xem (có thể co về phạm vi có dữ liệu ở chế độ "Tất cả").
 */
export function usePpaRange(from: string, to: string, maxMonths = 36) {
  return useQuery({
    queryKey: ppaRangeKey(from, to),
    queryFn: async ({ signal }): Promise<PpaRangeData> => {
      const periods = periodsBetween(from, to, maxMonths);
      const parts = await loadReportPeriods(periods, async period => {
        const query = reportPeriodQuery(period, from, to);
        const [ppa, daily, ctktkt] = await Promise.all([
          apiGet<{ entries: StoredPpaEntry[] }>(`/api/ctktkt/ppa-heat-rate?${query}`, { signal }),
          apiGet<{ entries: DailyInputEntry[] }>(`/api/ctktkt/daily-inputs?${query}&scope=non-ktkt`, { signal }),
          apiGet<{ entries?: CtktktLinkedEntry[]; linkedEntries?: CtktktLinkedEntry[] }>(`/api/ctktkt/ctktkt-report?${query}&scope=daily-links`, { signal }),
        ]);
        return { ppa: ppa.data.entries || [], daily: mergeDailyInputsWithCtktkt(daily.data.entries || [], [...(ctktkt.data.entries || []), ...(ctktkt.data.linkedEntries || [])], period) };
      }, signal);
      return { ppa: parts.flatMap(part => part.ppa), daily: parts.flatMap(part => part.daily) };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Vá dữ liệu khoảng đang xem ngay sau khi lưu nhận xét (không tải lại, như bản cũ vá state). */
export function usePatchPpaRange() {
  const qc = useQueryClient();
  return (from: string, to: string, patch: (data: PpaRangeData) => PpaRangeData) => {
    qc.setQueryData<PpaRangeData>(ppaRangeKey(from, to), current => current ? patch(current) : current);
    // Các trang/khoảng khác coi là cũ, tải lại khi mở tới — không tải lại khoảng đang xem.
    void qc.invalidateQueries({ queryKey: ["ctktkt"], refetchType: "none" });
  };
}

/** Tab Nhập & đồng bộ: toàn bộ dữ liệu ngày (kể cả ô KTKT) + lịch sử PPA của một tháng. */
export function usePpaMonth(period: string) {
  return useQuery({
    queryKey: ["ctktkt", "ppa-month", period],
    queryFn: async ({ signal }) => {
      const [daily, ctktkt, ppa] = await Promise.all([
        apiGet<{ entries: DailyInputEntry[] }>(`/api/ctktkt/daily-inputs?period=${period}`, { signal }),
        apiGet<{ entries?: CtktktLinkedEntry[]; linkedEntries?: CtktktLinkedEntry[] }>(`/api/ctktkt/ctktkt-report?period=${period}&scope=daily-links`, { signal }),
        apiGet<{ entries: StoredPpaEntry[] }>(`/api/ctktkt/ppa-heat-rate?period=${period}`, { signal }),
      ]);
      return {
        daily: mergeDailyInputsWithCtktkt(daily.data.entries || [], [...(ctktkt.data.entries || []), ...(ctktkt.data.linkedEntries || [])], period),
        history: ppa.data.entries || [],
      };
    },
    enabled: /^\d{4}-\d{2}$/.test(period),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Kết quả PPA kèm 48 điểm công tơ gốc của một tháng (nặng — chỉ dùng khi xuất Excel). */
export async function fetchPpaWithSource(period: string) {
  return (await apiGet<{ entries: StoredPpaWithSource[] }>(`/api/ctktkt/ppa-heat-rate?period=${period}&includeSource=1`)).data.entries || [];
}

/** Lưu kết quả một ngày (48 điểm nửa giờ/điểm đo); server tự tính lại PPA. */
export function useSavePpaDay(options: { invalidate?: boolean } = {}) {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (input: { operatingDate: string; source: PpaSourceData; sourceFiles?: string[]; noteS1?: string; noteS2?: string }) =>
      apiMutate<{ result: PpaResult }>("/api/ctktkt/ppa-heat-rate", "POST", input),
    onSuccess: options.invalidate === false ? undefined : invalidate,
  });
}

export type PpaNoteEntry = {
  operatingDate: string; noteS1?: string; noteS2?: string; eventS1?: string; eventS2?: string;
  availableCapacityS1Mw?: string | number | null; availableCapacityS2Mw?: string | number | null;
};
/** Nhận xét S1/S2, tình hình vận hành, công suất khả dụng (một hoặc nhiều ngày). Chỉ gửi trường nào có trong đối tượng. */
export function useSavePpaNotes(options: { invalidate?: boolean } = {}) {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (entries: PpaNoteEntry[]) => apiMutate<{ received: number; updated: number; skipped: number }>("/api/ctktkt/ppa-heat-rate/notes", "POST", { entries }),
    onSuccess: options.invalidate === false ? undefined : invalidate,
  });
}

/** Đồng bộ một ngày lên Google Sheet qua cấu hình Apps Script của máy chủ (chưa cấu hình: trả preview để gửi trực tiếp). */
export function useGoogleSheetSync() {
  return useMutation({
    mutationFn: (input: { operatingDate: string; action: "preview" | "sync" }) =>
      apiMutate<{ configured: boolean; preview?: GoogleSheetDayPayload; results?: unknown }>("/api/ctktkt/google-sheet-sync", "POST", input),
  });
}
