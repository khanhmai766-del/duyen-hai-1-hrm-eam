"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";

export interface EquipmentNode {
  seq: string;
  parentSeq: string | null;
  code: string;
  name: string;
  kks: string | null;
  drawing: string | null;
  depth: number;
}

/** Cây danh mục thiết bị (9k+ node) — tải một lần, cache lâu. */
export function useEquipmentTree() {
  return useQuery({
    queryKey: ["equipment-tree"],
    queryFn: () => apiGet<EquipmentNode[]>("/api/equipment-tree"),
    staleTime: 10 * 60 * 1000,
  });
}
