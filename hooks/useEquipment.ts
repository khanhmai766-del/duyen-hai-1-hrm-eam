"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";

export interface EquipmentNode {
  seq: string;
  parentSeq: string | null;
  name: string;
  drawing: string | null;
  depth: number;
  deviceId?: string | null;
}

/** Cây danh mục thiết bị (9k+ node) — tải một lần, cache lâu. */
export function useEquipmentTree() {
  return useQuery({
    queryKey: ["equipment-tree"],
    queryFn: () => apiGet<EquipmentNode[]>("/api/equipment-tree"),
    staleTime: 10 * 60 * 1000,
  });
}
