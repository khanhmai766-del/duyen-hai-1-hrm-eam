"use client";
import { useCallback } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";

/**
 * Trang Chỉ tiêu KTKT (`/api/ctktkt/ctktkt-report`, yêu cầu sửa, ảnh công tơ than, Gemini dùng chung).
 * Mọi khoá nằm dưới ["ctktkt"] để lượt ghi KTKT ở trang khác cũng đánh dấu cũ (lưu báo cáo, yêu cầu sửa, khôi phục sao lưu…).
 */
export type CtktktReportEntry = { operatingDate: string; cell: string; value: string };
export type CtktktReportRead<W = unknown> = {
  entries?: CtktktReportEntry[];
  linkedEntries?: CtktktReportEntry[];
  warnings?: W[];
  operatingHoursMissingDates?: string[];
};
export type CtktktReportSaveInput = {
  operatingDate: string;
  entries: Array<{ cell: string; value: string }>;
  coalUnit?: string;
  correctionReason?: string;
};

const REPORT_URL = "/api/ctktkt/ctktkt-report";

/**
 * Đọc báo cáo theo chuỗi truy vấn (`period=…&date=…&scope=…`). Bảng nhập tự giữ số đang sửa nên đọc kiểu mệnh lệnh:
 * staleTime 0 = luôn đọc máy chủ, hai bảng đọc cùng lúc thì dùng chung một lượt (đúng như bản cũ, khoá theo URL).
 */
export function useReadCtktktReport() {
  const client = useQueryClient();
  return useCallback(<W = unknown>(query: string) => client.fetchQuery({
    queryKey: ["ctktkt", "ctktkt-report", query],
    staleTime: 0, gcTime: 60_000, retry: false,
    queryFn: async ({ signal }) => (await apiGet<CtktktReportRead<W>>(`${REPORT_URL}?${query}`, { signal })).data,
  }), [client]);
}

/** Ô ĐÃ LƯU của một ngày, đọc thẳng máy chủ — dùng xác nhận sau khi lưu (không qua bộ nhớ đệm). */
export async function fetchStoredCtktktReport(period: string, date: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ period, date, scope: "stored" }).toString();
  return (await apiGet<{ entries?: CtktktReportEntry[] }>(`${REPORT_URL}?${query}`, { signal })).data.entries;
}

/** Lưu ô báo cáo (kèm `correctionReason` = gửi yêu cầu sửa; `coalUnit` = lưu công tơ than đã đối chiếu ảnh). */
export function useSaveCtktktReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CtktktReportSaveInput) =>
      apiMutate<{ saved?: number; requested?: number | boolean }>(REPORT_URL, "POST", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["ctktkt"] }),
  });
}

// ---- Yêu cầu chỉnh sửa số liệu ----
const CORRECTIONS_KEY = ["ctktkt", "correction-requests"] as const;

export function useCorrectionRequests<T>() {
  return useQuery({
    queryKey: CORRECTIONS_KEY,
    queryFn: async ({ signal }) => (await apiGet<{ entries?: T[] }>("/api/ctktkt/correction-requests", { signal })).data.entries || [],
    staleTime: 0, retry: false,
  });
}

export function useReviewCorrection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "approve" | "reject"; note: string }) =>
      apiMutate<unknown>("/api/ctktkt/correction-requests", "PATCH", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["ctktkt"] }),
  });
}

// ---- Ảnh công tơ than ----
export type CoalPhotoSummary<R> = { id: string; slot: string; reading: R; expiresAt: number };

/** Ảnh còn hạn CỦA CHÍNH người dùng trong ngày báo cáo (hộp "Ảnh đã lưu của bạn"). */
export function useOwnCoalPhotos<R>(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ctktkt", "coal-meter-photos", "own", date],
    queryFn: async ({ signal }) =>
      (await apiGet<{ photos?: CoalPhotoSummary<R>[] }>(`/api/ctktkt/coal-meter-photos?date=${encodeURIComponent(date)}`, { signal })).data.photos || [],
    enabled, staleTime: 0, retry: false,
    placeholderData: keepPreviousData,
  });
}

/** Ảnh còn hạn của mọi người trong một ngày (TKĐ đối chiếu; máy chủ kiểm quyền duyệt). */
export async function fetchCoalReviewPhotos<P>(date: string, signal?: AbortSignal) {
  return (await apiGet<{ photos?: P[] }>(`/api/ctktkt/coal-meter-photos?scope=review&date=${encodeURIComponent(date)}`, { signal })).data.photos || [];
}

/** Gửi một ảnh cho Gemini đọc số (máy chủ lưu ảnh 30 giờ nếu hợp lệ). `headers` mang khoá tạm nếu có. */
export async function readCoalMeterPhoto<T>(body: unknown, headers: Record<string, string>, signal: AbortSignal) {
  return apiMutate<T>("/api/ctktkt/coal-meter-ocr", "POST", body, { headers, signal });
}

/** Gọi thử Gemini bằng nguồn khoá đang chọn. */
export async function checkCoalGemini(headers: Record<string, string>, signal: AbortSignal) {
  return apiMutate<{ message?: string }>("/api/ctktkt/coal-gemini-settings/check", "POST", {}, { headers, signal });
}

// ---- Gemini dùng chung ----
export type CoalGeminiStatus = { configured: boolean; model: string | null; version: number; updatedAt: string | null; updatedBy: string | null };
export type CoalGeminiSettings = { shared: CoalGeminiStatus; environmentConfigured?: boolean };
const GEMINI_KEY = ["ctktkt", "coal-gemini-settings"] as const;

function requireShared(body: Partial<CoalGeminiSettings>) {
  if (!body.shared) throw new Error("Không nhận được trạng thái cấu hình.");
  return body as CoalGeminiSettings;
}

export function useCoalGeminiSettings() {
  return useQuery({
    queryKey: GEMINI_KEY,
    queryFn: async ({ signal }) => requireShared((await apiGet<Partial<CoalGeminiSettings>>("/api/ctktkt/coal-gemini-settings", { signal })).data),
    staleTime: 0, retry: false,
  });
}

export function useSaveCoalGeminiSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; model: string; expectedVersion: number }) =>
      requireShared(await apiMutate<Partial<CoalGeminiSettings>>("/api/ctktkt/coal-gemini-settings", "PUT", input)),
    onSuccess: data => { client.setQueryData(GEMINI_KEY, data); },
  });
}

// ---- Tải file báo cáo ----
/** Tải file xuất (Excel). Lỗi máy chủ là JSON phong bì → ném câu báo lỗi; thành công là tệp đính kèm. */
export async function downloadCtktktFile(url: string) {
  const { blob, filename } = await apiDownload(url);
  const href = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = href; link.download = filename === "download.xlsx" ? "bao-cao.xlsx" : filename;
  link.click(); window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
