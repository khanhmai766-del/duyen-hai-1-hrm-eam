"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface EquipmentNode {
  seq: string;
  parentSeq: string | null;
  name: string;
  drawing: string | null;
  depth: number;
  deviceId?: string | null;
  attachedInfo?: string | null;
  documentUrl?: string | null;
  imageUrl?: string | null;
}

/** Cây danh mục thiết bị (9k+ node) — tải một lần, cache lâu. */
export function useEquipmentTree() {
  return useQuery({
    queryKey: ["equipment-tree"],
    queryFn: () => apiGet<EquipmentNode[]>("/api/equipment-tree"),
    staleTime: 10 * 60 * 1000,
  });
}

/** Cập nhật thông tin/tài liệu/ảnh bổ sung của một node thiết bị (theo seq). */
export function useUpdateEquipmentNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { seq: string; attachedInfo?: string | null; documentUrl?: string | null; imageUrl?: string | null }) =>
      apiMutate("/api/equipment-tree", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-tree"] }),
  });
}
