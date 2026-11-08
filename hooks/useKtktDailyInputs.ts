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

/**
 * Lưu một lô ô dữ liệu ngày của MỘT tháng (POST /api/ctktkt/daily-inputs). Giá trị và ghi chú cùng rỗng = xoá ô.
 * `invalidate: false` khi lưu nhiều lô liên tiếp (đồng bộ nhiều ngày) — gọi `useInvalidateKtkt()` một lần ở cuối.
 */
export function useSaveDailyInputs(options: { invalidate?: boolean } = {}) {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (input: { period: string; entries: DailyInputEntry[] }) => apiMutate<{ saved: number }>("/api/ctktkt/daily-inputs", "POST", input),
    onSuccess: options.invalidate === false ? undefined : invalidate,
  });
}

/** Làm mới mọi dữ liệu KTKT đang hiển thị (dữ liệu ngày ảnh hưởng chéo nhiều trang). */
export function useInvalidateKtkt() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ctktkt"] });
}
