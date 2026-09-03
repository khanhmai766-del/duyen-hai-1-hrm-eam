"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiGet, apiMutate } from "@/lib/fetcher";

export interface TbycnnEquipment {
  id: string;
  /** null = thiết bị tự thêm qua giao diện; có giá trị = thiết bị gốc theo hồ sơ nhà máy. */
  sourceId: number | null;
  khuVuc: string;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  nhom: string;
  nhomSo: number | null;
  danhMuc: string;
  tt: number | null;
  tenThietBi: string;
  soLuong: number | null;
  maHieu: string | null;
  kks: string | null;
  thongSoKyThuat: string | null;
  viTri: string | null;
  chucDanhQuanLy: string | null;
  donViQuanLy: string | null;
  chuKyThu: number | null;
  /** Ngày đã parse (ISO) — chỉ có khi chuỗi gốc đúng dd/mm/yyyy. */
  kdGanNhat: string | null;
  /** Nguyên văn người dùng nhập ("Chưa dán tem", "06/26"…). */
  kdGanNhatText: string | null;
  soBbkd: string | null;
  donViKd: string | null;
  kdTiepTheo: string | null;
  kdTiepTheoText: string | null;
  khiemKhuyet: string | null;
  soLuongKhaDung: number | null;
  soLuongKhongKhaDung: number | null;
  /** Suy ra ở server từ hai ô số lượng — client không tự tính lại. */
  tinhTrang: string;
  ghiChu: string | null;
  canDelete: boolean;
  /** Dòng này có nằm trong phạm vi cương vị được ghi của người đăng nhập không. */
  canWrite: boolean;
  signature: TbycnnSignature | null;
}

export interface TbycnnSignature {
  signerName: string;
  signerPosition: string | null;
  signedAt: string;
  signatureUrl: string | null;
}

export interface TbycnnWriteScope {
  all: boolean;
  codes: string[];
  labels: string[];
}

/** Số liệu bản XEM TRƯỚC của hộp thoại ký — server đếm, client không đoán. */
export interface TbycnnSignPreview {
  total: number;
  alreadySigned: number;
  willSign: number;
  rows: { id: string; label: string; code: string; cuongVi: string; machine: string; signed: boolean }[];
  rowsTruncated: boolean;
  scopeLabel: string;
  periodLabel: string;
  signerName: string;
  hasSignature: boolean;
  signatureSetupUrl: string;
}

export interface TbycnnSignResult {
  signed: number;
  resigned: number;
  signerName: string;
  signedAt: string;
  signatureUrl: string | null;
  scopeLabel: string;
  periodLabel: string;
}

export interface TbycnnPeriodInfo {
  label: string;
  isClosed: boolean;
  closedAt: string | null;
}

const KEY = ["tbycnn"] as const;

export function useTbycnn(period?: string) {
  return useQuery({
    queryKey: [...KEY, period ?? "current"],
    queryFn: async () => {
      const qs = period ? `?period=${encodeURIComponent(period)}` : "";
      const res = await apiGet<TbycnnEquipment[]>(`/api/tbycnn${qs}`);
      return {
        rows: res.data,
        period: res.meta?.period as TbycnnPeriodInfo | undefined,
        periods: (res.meta?.periods as TbycnnPeriodInfo[] | undefined) ?? [],
        canManage: Boolean(res.meta?.canManage),
        writeScope: (res.meta?.writeScope as TbycnnWriteScope | undefined) ?? { all: false, codes: [], labels: [] },
      };
    },
  });
}

/** Chỉ gửi các trường thực sự đổi — API bỏ qua trường không có mặt trong body. */
export function useUpdateTbycnn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<TbycnnEquipment>) =>
      apiMutate<TbycnnEquipment>(`/api/tbycnn/${id}`, "PUT", patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateTbycnn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<TbycnnEquipment>) =>
      apiMutate<TbycnnEquipment>("/api/tbycnn", "POST", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTbycnn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/tbycnn/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Lưu MỘT LƯỢT các dòng vừa sửa ở chế độ "Sửa bảng". Gửi cả loạt trong một request để
 * server ghi trong một transaction — nửa chừng hỏng thì không dòng nào vào.
 */
export function useSaveTbycnnBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Array<{ id: string } & Record<string, unknown>>) =>
      apiMutate<{ saved: number }>("/api/tbycnn/bulk", "POST", { updates }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export type TbycnnSignInput = {
  period?: string;
  cuongViCode?: string;
  machine?: string;
  targetIds?: string[];
};

/** Xem trước: KHÔNG ghi gì, chỉ lấy số liệu cho hộp thoại xác nhận. */
export function useTbycnnSignPreview() {
  return useMutation({
    mutationFn: (input: TbycnnSignInput) =>
      apiMutate<TbycnnSignPreview>("/api/tbycnn/signatures", "POST", { ...input, preview: true }),
  });
}

export function useTbycnnSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TbycnnSignInput) => apiMutate<TbycnnSignResult>("/api/tbycnn/signatures", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUnsignTbycnn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipmentId: string) =>
      apiMutate<{ equipmentId: string }>("/api/tbycnn/signatures", "DELETE", { equipmentId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Tải file Excel của kỳ; bỏ trống cả hai bộ lọc = xuất toàn bộ. */
export async function downloadTbycnnExcel(params: { period?: string; cuongViCode?: string; machine?: string }) {
  const qs = new URLSearchParams();
  if (params.period) qs.set("period", params.period);
  if (params.cuongViCode) qs.set("cuongViCode", params.cuongViCode);
  if (params.machine) qs.set("machine", params.machine);
  const { blob, filename } = await apiDownload(`/api/tbycnn/export?${qs.toString()}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
