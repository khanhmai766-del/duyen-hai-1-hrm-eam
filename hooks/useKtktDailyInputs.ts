"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { mergeDailyInputsWithCtktkt } from "@/modules/ctktkt/lib/daily-source-links";
import { loadReportPeriods, reportPeriodQuery } from "@/modules/ctktkt/lib/report-loading";

/** Một ô dữ liệu ngày (bảng Dữ liệu các tháng / PMIS) — mã ô theo cột Excel gốc (B, F, DA…). */
export type DailyInputEntry = { operatingDate: string; fieldCode: string; value: string; note?: string };
type CtktktLinkedEntry = { operatingDate: string; cell: string; value: string };

/** Các tháng (YYYY-MM) mà khoảng [from, to] đi qua; dừng khi vượt `maxMonths` (PMIS 24 → tối đa 25 tháng, PPA 36 → 37, như bản cũ). */
export function periodsBetween(from: string, to: string, maxMonths = 24) {
  const periods: string[] = [];
  let year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4)), endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1; if (month > 12) { month = 1; year += 1; }
    if (periods.length > maxMonths) break;
  }
  return periods;
}

/**
 * Dữ liệu ngày ngoài Chỉ tiêu KTKT cho khoảng [from, to], đã gộp các ô tự liên kết từ Chỉ tiêu KTKT
 * (B, C, H, I…). Tải lần lượt từng tháng giao với khoảng, mỗi tháng gọi song song 2 API — y như bản cũ.
 * Đổi khoảng: giữ dữ liệu cũ trên màn hình tới khi khoảng mới về.
 */
export function useDailyInputsRange(from: string, to: string) {
  return useQuery({
    queryKey: ["ctktkt", "daily-inputs-range", from, to],
    queryFn: async ({ signal }) => {
      const parts = await loadReportPeriods(periodsBetween(from, to), async period => {
        const query = reportPeriodQuery(period, from, to);
        const [daily, ctktkt] = await Promise.all([
          apiGet<{ entries: DailyInputEntry[] }>(`/api/ctktkt/daily-inputs?${query}&scope=non-ktkt`, { signal }),
          apiGet<{ entries?: CtktktLinkedEntry[]; linkedEntries?: CtktktLinkedEntry[] }>(`/api/ctktkt/ctktkt-report?${query}&scope=daily-links`, { signal }),
        ]);
        return mergeDailyInputsWithCtktkt(daily.data.entries || [], [...(ctktkt.data.entries || []), ...(ctktkt.data.linkedEntries || [])], period);
      }, signal);
      return parts.flat();
    },
    enabled: Boolean(from && to && from <= to),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

type CtktktReportEntry = { operatingDate: string; cell: string; value: string };

/**
 * Bảng Dữ liệu các tháng (bảng nhập đang sửa): toàn bộ ô dữ liệu ngày của tháng (kể cả ghi chú) + ô Chỉ tiêu KTKT
 * để suy ra các cột tự liên kết. gcTime 0 + staleTime Infinity: đổi tháng luôn đọc mới, không tự tải lại trong lúc
 * đang sửa (lưu dùng `useSaveDailyInputs({ invalidate: "mark" })`). Chỉ tiêu KTKT đọc lỗi → `ctktkt: null`, bảng vẫn
 * hiện dữ liệu ngày (đúng như bản cũ bỏ qua lỗi phần này).
 */
export function useDailyInputsMonth(period: string) {
  return useQuery({
    queryKey: ["ctktkt", "daily-month", period],
    queryFn: async ({ signal }) => {
      const [daily, ctktkt] = await Promise.all([
        apiGet<{ entries: DailyInputEntry[] }>(`/api/ctktkt/daily-inputs?period=${encodeURIComponent(period)}`, { signal }),
        apiGet<{ entries?: CtktktReportEntry[]; linkedEntries?: CtktktReportEntry[] }>(`/api/ctktkt/ctktkt-report?period=${encodeURIComponent(period)}`, { signal })
          .then(result => [...(result.data.entries || []), ...(result.data.linkedEntries || [])])
          .catch(error => { if (signal.aborted) throw error; return null; }),
      ]);
      return { daily: daily.data.entries || [], ctktkt };
    },
    enabled: /^\d{4}-\d{2}$/.test(period),
    gcTime: 0,
    staleTime: Infinity,
  });
}

/** Toàn bộ ô dữ liệu ngày của một tháng, đọc mới (dùng giữ ghi chú khi đồng bộ nhiều ngày). */
export async function fetchDailyInputsMonth(period: string) {
  return (await apiGet<{ entries: DailyInputEntry[] }>(`/api/ctktkt/daily-inputs?period=${period}`)).data.entries || [];
}

/**
 * Lưu một lô ô dữ liệu ngày của MỘT tháng (POST /api/ctktkt/daily-inputs). Giá trị và ghi chú cùng rỗng = xoá ô.
 * `invalidate: false` khi lưu nhiều lô liên tiếp (đồng bộ nhiều ngày) — gọi `useInvalidateKtkt()` một lần ở cuối.
 * `invalidate: "mark"` cho trang có bảng nhập đang sửa: chỉ đánh dấu cũ, KHÔNG tải lại trang đang mở (giữ ô đang sửa dở).
 */
export function useSaveDailyInputs(options: { invalidate?: boolean | "mark" } = {}) {
  const invalidate = useInvalidateKtkt();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { period: string; entries: DailyInputEntry[] }) => apiMutate<{ saved: number }>("/api/ctktkt/daily-inputs", "POST", input),
    onSuccess: options.invalidate === false ? undefined
      : options.invalidate === "mark" ? () => qc.invalidateQueries({ queryKey: ["ctktkt"], refetchType: "none" })
      : invalidate,
  });
}

/** Làm mới mọi dữ liệu KTKT đang hiển thị (dữ liệu ngày ảnh hưởng chéo nhiều trang). */
export function useInvalidateKtkt() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ctktkt"] });
}
