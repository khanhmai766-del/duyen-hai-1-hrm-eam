"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

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
  groups: OilStockGroup[];
  pendingCount: number;
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
  items: OilPendingItem[];
  oilTypes: OilTypeOption[];
}

export interface OilConfirmInput {
  materialIds: string[];
  action: "CONFIRM" | "IGNORE";
  oilTypeId?: string;
  newOilType?: { code: string; name: string; baseUnit: string; minStock?: number };
  conversionFactor?: number;
}

export function useOilStock() {
  return useQuery({
    queryKey: ["oil-stock"],
    queryFn: () => apiGet<OilStockData>("/api/vat-tu/oil-grouping/stock"),
  });
}

export function useOilSuggestions(enabled = true) {
  return useQuery({
    queryKey: ["oil-suggestions"],
    queryFn: () => apiGet<OilSuggestionsData>("/api/vat-tu/oil-grouping/suggestions"),
    enabled,
  });
}

/** Quét lại gợi ý gom nhóm cho các mã chưa duyệt. */
export function useOilGroupingSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiMutate<{ scanned: number; suggested: number; unmapped: number }>("/api/vat-tu/oil-grouping/sync", "POST"),
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
