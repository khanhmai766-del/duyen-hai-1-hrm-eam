"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, apiReportResponse, apiUpload } from "@/lib/fetcher";
import type { OperatingEvent, ShiftMetric } from "@/modules/ctktkt/lib/bcsx";
import type { DailyInputEntry } from "@/hooks/useKtktDailyInputs";

type Unit = "S1" | "S2";
export type ShiftReadingEntry = { unit: Unit; timeSlot: string; metric: ShiftMetric; value: string };
export type UnitOperatingEvent = OperatingEvent & { id?: number; unit: Unit };
export type CtktktLinkedEntry = { operatingDate: string; cell: string; value: string };

/** Số liệu nửa giờ của một ngày (cả S1, S2). Luôn đọc mới — dùng cho sao lưu/đọc lại xác minh khi nạp Mục 1. */
export async function fetchShiftReadings(date: string) {
  return (await apiGet<{ entries: ShiftReadingEntry[] }>(`/api/ctktkt/shift-readings?date=${encodeURIComponent(date)}`)).data.entries || [];
}
export async function fetchOperatingEvents(date: string) {
  return (await apiGet<{ events: UnitOperatingEvent[] }>(`/api/ctktkt/operating-events?date=${encodeURIComponent(date)}`)).data.events || [];
}
/** Dữ liệu ngày + ô liên kết Chỉ tiêu KTKT dùng cho Mục 2 (tổng hợp). `nonKtkt`: bỏ ô KTKT như lượt tải trang. */
export async function fetchBcsxTotalsSource(date: string, nonKtkt: boolean, signal?: AbortSignal) {
  const period = date.slice(0, 7);
  const [daily, ctktkt] = await Promise.all([
    apiGet<{ entries: DailyInputEntry[] }>(`/api/ctktkt/daily-inputs?period=${period}&date=${date}${nonKtkt ? "&scope=non-ktkt" : ""}`, { signal }),
    apiGet<{ entries?: CtktktLinkedEntry[]; linkedEntries?: CtktktLinkedEntry[] }>(`/api/ctktkt/ctktkt-report?period=${period}&date=${date}&scope=daily-links`, { signal }),
  ]);
  return { daily: daily.data.entries || [], ctktkt: [...(ctktkt.data.entries || []), ...(ctktkt.data.linkedEntries || [])] };
}

/**
 * Toàn bộ dữ liệu một ngày BCSX: số liệu nửa giờ, sự kiện, nguồn Mục 2. Trang chép dữ liệu này vào bảng đang sửa,
 * nên: gcTime 0 (chọn lại ngày luôn tải mới, không hiện bản cũ) và các lượt lưu KHÔNG tải lại ngày đang sửa
 * (xem useMarkKtktStale) — tránh ghi đè ô người dùng đang sửa dở, đúng như bản cũ.
 */
export function useBcsxDay(date: string) {
  return useQuery({
    queryKey: ["ctktkt", "bcsx-day", date],
    queryFn: async ({ signal }) => {
      const [readings, events] = await Promise.all([
        apiGet<{ entries: ShiftReadingEntry[] }>(`/api/ctktkt/shift-readings?date=${date}`, { signal }),
        apiGet<{ events: UnitOperatingEvent[] }>(`/api/ctktkt/operating-events?date=${date}`, { signal }),
      ]);
      const totals = await fetchBcsxTotalsSource(date, true, signal);
      return { readings: readings.data.entries || [], events: events.data.events || [], ...totals };
    },
    gcTime: 0,
    staleTime: Infinity,
  });
}

/** Đánh dấu dữ liệu KTKT là cũ (trang khác tải lại khi mở) nhưng không tải lại trang đang sửa. */
function useMarkKtktStale() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ctktkt"], refetchType: "none" });
}

export function useSaveShiftReadings() {
  const markStale = useMarkKtktStale();
  return useMutation({
    mutationFn: (input: { date: string; entries: ShiftReadingEntry[] }) => apiMutate<{ saved: number }>("/api/ctktkt/shift-readings", "POST", input),
    onSuccess: markStale,
  });
}

/** Thay toàn bộ danh sách sự kiện của (ngày, tổ máy). */
export function useSaveOperatingEvents() {
  const markStale = useMarkKtktStale();
  return useMutation({
    mutationFn: (input: { date: string; unit: Unit; events: OperatingEvent[] }) => apiMutate<{ saved: number }>("/api/ctktkt/operating-events", "POST", input),
    onSuccess: markStale,
  });
}

/** Than tồn kho 24h toàn nhà máy (liên kết sang Chỉ tiêu KTKT). */
export function useSaveCoalStock() {
  const markStale = useMarkKtktStale();
  return useMutation({
    mutationFn: (input: { operatingDate: string; value: string }) => apiMutate<{ saved: true; value: string }>("/api/ctktkt/bcsx-coal-stock", "POST", input),
    onSuccess: markStale,
  });
}

/** Đọc 2 file Excel S1/S2 thành gói nhập Mục 1 (máy chủ không ghi gì). */
export function useParseSection1Import<T>() {
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      files.forEach(file => form.append("files", file));
      return apiUpload<T>("/api/ctktkt/bcsx-section1-import", form);
    },
  });
}

/**
 * Nhập file lệnh điều độ: máy chủ tự lưu Mục 3 và trả file QLKT để tải về (kèm số sự kiện trong header).
 * Phản hồi thành công là FILE, không phải JSON — đọc bằng apiReportResponse (lỗi JSON → {error}) như bản cũ.
 */
export function useImportOperationCommands() {
  const markStale = useMarkKtktStale();
  return useMutation({
    mutationFn: async (input: { file: File; date: string }) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("date", input.date);
      const response = await apiReportResponse("/api/ctktkt/bcsx-operation-import", { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Không nhập được file lệnh điều độ.");
      }
      return { blob: await response.blob(), headers: response.headers };
    },
    onSuccess: markStale,
  });
}

/** Tải file BCSX (S1/S2/A0) của một ngày. */
export async function downloadBcsxExport(date: string, target: "S1" | "S2" | "A0") {
  const res = await apiReportResponse(`/api/ctktkt/bcsx-export?date=${date}&unit=${target}`);
  if (!res.ok) { const json = await res.json().catch(() => null) as { error?: string } | null; throw new Error(json?.error || "Không xuất được file."); }
  return { blob: await res.blob(), fileName: /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `BCSX_NMD_${target}_${date}.xlsx` };
}
