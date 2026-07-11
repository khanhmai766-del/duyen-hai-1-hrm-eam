"use client";

import { useQueries } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";

const GROUPED_STOCK_CATEGORIES = ["Dầu bôi trơn", "Lõi lọc dầu", "Thiết bị C&I", "Hóa Chất", "Bi Nghiền Than"] as const;

type GroupedStockCategory = (typeof GROUPED_STOCK_CATEGORIES)[number];

type GroupedStockMaterial = {
  id: string;
  erpCode: string;
  name: string;
  unit: string;
  erpQty: number;
};

type GroupedStockResponse = {
  category: GroupedStockCategory;
  groups: Array<{
    materials: GroupedStockMaterial[];
  }>;
};

export type ErpMaterialFromGroupedStock = {
  id: string;
  code: string;
  name: string;
  unit: string;
  erpStock: number;
  category: GroupedStockCategory;
};

export function useErpMaterials() {
  const queries = useQueries({
    queries: GROUPED_STOCK_CATEGORIES.map((category) => ({
      queryKey: ["oil-stock", category],
      queryFn: () => apiGet<GroupedStockResponse>(`/api/vat-tu/oil-grouping/stock?category=${encodeURIComponent(category)}`),
    })),
  });

  const byCode = new Map<string, ErpMaterialFromGroupedStock>();
  for (const query of queries) {
    const stock = query.data?.data;
    if (!stock) continue;
    for (const group of stock.groups) {
      for (const material of group.materials) {
        if (byCode.has(material.erpCode)) continue;
        byCode.set(material.erpCode, {
          id: material.id,
          code: material.erpCode,
          name: material.name,
          unit: material.unit,
          erpStock: material.erpQty,
          category: stock.category,
        });
      }
    }
  }

  const materials = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, "vi"));
  const firstError = queries.find((query) => query.error)?.error;

  return {
    data: { data: materials, meta: { total: materials.length } },
    isLoading: queries.some((query) => query.isLoading),
    isFetching: queries.some((query) => query.isFetching),
    isError: queries.some((query) => query.isError),
    error: firstError,
  };
}
