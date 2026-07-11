"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

// Các loại vật tư được gom nhóm — khớp GROUPABLE_CATEGORIES phía server.
export const GROUPING_CATEGORIES = ["Dầu bôi trơn", "Lõi lọc dầu", "Hóa Chất", "Bi Nghiền Than"] as const;
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
  action: "CONFIRM" | "IGNORE";
  oilTypeId?: string;
  newOilType?: { code: string; name: string; baseUnit: string; minStock?: number; category: GroupingCategory };
  conversionFactor?: number;
}

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

/** Duyệt gom mã vào nhóm (có sẵn / tạo mới) hoặc bỏ qua (IGNORE). */
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
