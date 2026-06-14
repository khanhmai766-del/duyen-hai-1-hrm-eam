"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { Material } from "@/types";

export interface MaterialWithDevices extends Material {
  deviceMaterials?: Array<{
    id: string;
    deviceId: string;
    materialId: string;
    quantity: number;
    usedAt: string | Date;
    note: string | null;
    device: { id: string; code: string; name: string; system: string | null; managingPosition: string | null };
  }>;
}

export function useMaterials() {
  return useQuery({ queryKey: ["materials"], queryFn: () => apiGet<MaterialWithDevices[]>("/api/materials") });
}

export type MaterialInput = Partial<Material> & { id?: string; deviceId?: string | null };

export function useUpsertMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaterialInput) =>
      apiMutate<Material>("/api/materials", body.id ? "PUT" : "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materials"] }),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/materials?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materials"] }),
  });
}

/** Xoá hàng loạt nhiều vật tư trong một lần gọi. */
export function useDeleteMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiMutate<{ ids: string[]; count: number }>("/api/materials", "DELETE", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materials"] }),
  });
}
