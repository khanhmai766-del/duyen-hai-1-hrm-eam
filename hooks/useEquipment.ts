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
}

export interface EquipmentNodeDetail extends EquipmentNode {
  attachedInfo: string | null;
  documentUrl: string | null;
  imageUrl: string | null;
}

/** Cây danh mục thiết bị (9k+ node) — tải một lần, cache lâu. */
export function useEquipmentTree() {
  return useQuery({
    queryKey: ["equipment-tree"],
    queryFn: () => apiGet<EquipmentNode[]>("/api/equipment-tree"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useEquipmentNode(seq: string | null | undefined) {
  return useQuery({
    queryKey: ["equipment-node", seq],
    queryFn: () => apiGet<EquipmentNodeDetail>(`/api/equipment-tree/${encodeURIComponent(seq!)}`),
    enabled: !!seq,
    staleTime: 5 * 60 * 1000,
  });
}

/** Cập nhật thông tin/tài liệu/ảnh bổ sung của một node thiết bị (theo seq). */
export function useUpdateEquipmentNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { seq: string; attachedInfo?: string | null; documentUrl?: string | null; imageUrl?: string | null }) =>
      apiMutate("/api/equipment-tree", "PUT", body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
      qc.invalidateQueries({ queryKey: ["equipment-node", body.seq] });
    },
  });
}
