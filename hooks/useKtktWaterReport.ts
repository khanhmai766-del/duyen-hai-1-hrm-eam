"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, apiUpload } from "@/lib/fetcher";
import type { MonthlyWaterSummary, WaterShiftLog } from "@/modules/ctktkt/lib/water-report/calculations";

/** Dữ liệu một tháng — đúng body GET /api/ctktkt/water-report?month=YYYY-MM. */
export type WaterReportMonth = {
  ok: true;
  month: string;
  leaders: string[];
  baseline: WaterShiftLog | null;
  shifts: WaterShiftLog[];
  summary: MonthlyWaterSummary;
};
export type WaterLeader = { id: number; name: string; isActive: number; displayOrder: number };
export type WaterSheetScan = { sheetName: string; month: string; shiftCount: number; firstDate: string; lastDate: string };
export type WaterImportResult = { ok: true; totalShifts: number; months: string[]; message: string };

const URL = "/api/ctktkt/water-report";
const KEY = ["ctktkt", "water-report"] as const;

/**
 * Ghi ca nước làm đổi cả các ô Chỉ tiêu KTKT liên kết (W/X/Y/Z nước tái sinh…): làm mới mọi dữ liệu KTKT,
 * đúng như useCtktktRequest cũ (invalidate ["ctktkt"]).
 */
function useInvalidateKtkt() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ctktkt"] });
}

export function useWaterReportMonth(month: string, options?: { placeholderData?: typeof keepPreviousData }) {
  return useQuery({
    queryKey: [...KEY, "month", month],
    queryFn: async ({ signal }) => (await apiGet<WaterReportMonth>(`${URL}?month=${month}`, { signal })).data,
    enabled: /^\d{4}-\d{2}$/.test(month),
    staleTime: 30_000,
    placeholderData: options?.placeholderData,
  });
}

/** Danh sách Trưởng ca (quản trị) — chỉ tải khi mở hộp quản lý. */
export function useWaterLeaders(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "leaders"],
    queryFn: async ({ signal }) => (await apiGet<{ ok: true; leaders: WaterLeader[] }>(`${URL}/leaders`, { signal })).data.leaders,
    enabled,
    staleTime: 30_000,
  });
}

/** Lưu một ca; khi sửa ca có sẵn, chỉ gửi các ô vừa đổi trong changedFields (server giữ nguyên ô khác). */
export function useSaveWaterShift() {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (input: { shift: Partial<WaterShiftLog>; changedFields?: Array<keyof WaterShiftLog> }) =>
      apiMutate<{ ok: true; saved: number }>(URL, "POST", input),
    onSuccess: invalidate,
  });
}

export function useDeleteWaterShift() {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (shift: Pick<WaterShiftLog, "id" | "logDate" | "shiftTime">) =>
      apiMutate<{ ok: true; message: string }>(`${URL}?id=${shift.id}&logDate=${shift.logDate}&shiftTime=${shift.shiftTime}`, "DELETE"),
    onSuccess: invalidate,
  });
}

export function useSaveWaterLeader() {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (input: { name: string; displayOrder: number }) => apiMutate<{ ok: true; message: string }>(`${URL}/leaders`, "POST", input),
    onSuccess: invalidate,
  });
}

export function useDeleteWaterLeader() {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: (id: number) => apiMutate<{ ok: true; message: string }>(`${URL}/leaders?id=${id}`, "DELETE"),
    onSuccess: invalidate,
  });
}

/** Quét các sheet trong file Excel tháng (không ghi gì). */
export function useScanWaterWorkbook() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("action", "scan");
      return apiUpload<{ ok: true; sheets: WaterSheetScan[] }>(`${URL}/upload`, form);
    },
  });
}

/** Nạp các ca từ file Excel; sheetNames rỗng = nạp mọi sheet. */
export function useImportWaterWorkbook() {
  const invalidate = useInvalidateKtkt();
  return useMutation({
    mutationFn: ({ file, sheetNames }: { file: File; sheetNames?: string[] }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("action", "import");
      if (sheetNames?.length) form.append("sheetNames", JSON.stringify(sheetNames));
      return apiUpload<WaterImportResult>(`${URL}/upload`, form);
    },
    onSuccess: invalidate,
  });
}
