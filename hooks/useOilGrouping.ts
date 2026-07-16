"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

// Các loại vật tư được gom nhóm — khớp GROUPABLE_CATEGORIES phía server.
export const GROUPING_CATEGORIES = ["Dầu bôi trơn", "Lõi lọc dầu", "Thiết bị C&I", "Hóa Chất", "Bi Nghiền Than"] as const;
export type GroupingCategory = (typeof GROUPING_CATEGORIES)[number];

export interface OilMaterialRow {
  id: string;
  erpCode: string;
  name: string;
  unit: string;
  erpQty: number;
  conversionFactor: number;
  origin: string | null;
  qtyInBase: number;
}

export interface OilStockGroup {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  minStock: number | null;
  onHandQty: number; // "Hiện có" — số đếm thực tế tại kho, nhập tay
  totalQty: number;
  belowMin: boolean;
  materialCount: number;
  materials: OilMaterialRow[];
}

export interface OilStockData {
  category: GroupingCategory;
  groups: OilStockGroup[];
  pendingCount: number;
  pendingByCategory: Record<GroupingCategory, number>;
  warningCount: number;
}

export interface OilPendingItem {
  id: string;
  erpCode: string;
  name: string;
  unit: string;
  erpQty: number;
  mappingStatus: "SUGGESTED" | "UNMAPPED";
  suggestedOilTypeId: string | null;
  suggestedScore: number | null;
  suggestedReason: string | null;
}

export interface OilTypeOption {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
}

export interface OilSuggestionsData {
  category: GroupingCategory;
  items: OilPendingItem[];
  oilTypes: OilTypeOption[];
}

export interface OilConfirmInput {
  materialIds: string[];
  action: "CONFIRM" | "IGNORE" | "SINGLE";
  oilTypeId?: string;
  newOilType?: { code: string; name: string; baseUnit: string; minStock?: number; category: GroupingCategory };
  conversionFactor?: number;
}

export type GroupedErpMaterialInput = {
  code: string;
  name: string;
  unit: string;
  category: GroupingCategory;
  erpStock?: number;
};

export type GroupedErpImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export function useOilStock(category: GroupingCategory) {
  return useQuery({
    queryKey: ["oil-stock", category],
    queryFn: () => apiGet<OilStockData>(`/api/vat-tu/oil-grouping/stock?category=${encodeURIComponent(category)}`),
  });
}

export function useOilSuggestions(category: GroupingCategory, enabled = true) {
  return useQuery({
    queryKey: ["oil-suggestions", category],
    queryFn: () => apiGet<OilSuggestionsData>(`/api/vat-tu/oil-grouping/suggestions?category=${encodeURIComponent(category)}`),
    enabled,
  });
}

/** Quét lại gợi ý gom nhóm cho các mã chưa duyệt của một loại vật tư. */
export function useOilGroupingSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: GroupingCategory) =>
      apiMutate<{ scanned: number; suggested: number; unmapped: number }>("/api/vat-tu/oil-grouping/sync", "POST", { category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-suggestions"] });
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
    },
  });
}

/** Duyệt gom mã, tạo nhóm riêng (SINGLE), hoặc xử lý dữ liệu cũ theo IGNORE. */
export function useOilGroupingConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OilConfirmInput) => apiMutate("/api/vat-tu/oil-grouping/confirm", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-suggestions"] });
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
    },
  });
}

export function useCreateGroupedErpMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GroupedErpMaterialInput) => apiMutate("/api/vat-tu/oil-grouping/materials", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
      qc.invalidateQueries({ queryKey: ["oil-suggestions"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
    },
  });
}

export function useUpdateGroupedErpStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; erpStock: number }) =>
      apiMutate("/api/vat-tu/oil-grouping/materials", "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
    },
  });
}

export function useImportGroupedErpMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: GroupedErpMaterialInput[]) =>
      apiMutate<GroupedErpImportResult>("/api/vat-tu/oil-grouping/import", "POST", { rows }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
      qc.invalidateQueries({ queryKey: ["oil-suggestions"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
    },
  });
}

export function useDeletePendingGroupedErpMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiMutate<{ ids: string[]; count: number }>("/api/vat-tu/oil-grouping/materials", "DELETE", { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
      qc.invalidateQueries({ queryKey: ["oil-suggestions"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
    },
  });
}

// Cập nhật TỪNG PHẦN — chỉ field có mặt mới được ghi (server giữ nguyên phần còn lại).
export interface OilGroupUpdateInput {
  id: string;
  code?: string;
  name?: string;
  baseUnit?: string;
  minStock?: number | null;
  onHandQty?: number;
}

/** Sửa thông tin nhóm vật tư (mã, tên, ĐVT chuẩn, ngưỡng tối thiểu, hiện có). */
export function useUpdateOilGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OilGroupUpdateInput) => apiMutate("/api/vat-tu/oil-grouping/groups", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oil-stock"] }),
  });
}

/** Xoá nhóm — các mã trong nhóm trở về "Chờ phân nhóm". */
export function useDeleteOilGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiMutate<{ deleted: string; ungrouped: number }>(`/api/vat-tu/oil-grouping/groups?id=${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
      qc.invalidateQueries({ queryKey: ["oil-suggestions"] });
    },
  });
}
