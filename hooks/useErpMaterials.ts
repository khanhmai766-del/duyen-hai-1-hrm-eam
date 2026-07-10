"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ErpMaterial } from "@prisma/client";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type ErpMaterialInput = Partial<ErpMaterial> & {
  id?: string;
};

export type ErpMaterialImportRow = {
  code: string;
  name: string;
  unit: string;
  category?: string | null;
  erpStock?: number;
};

export type ErpMaterialImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export function useErpMaterials() {
  return useQuery({
    queryKey: ["erp-materials"],
    queryFn: () => apiGet<ErpMaterial[]>("/api/materials/erp"),
  });
}

export function useUpsertErpMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ErpMaterialInput) =>
      apiMutate<ErpMaterial>("/api/materials/erp", body.id ? "PUT" : "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-materials"] }),
  });
}

export function useDeleteErpMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/materials/erp?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-materials"] }),
  });
}

export function useDeleteErpMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiMutate<{ ids: string[]; count: number }>("/api/materials/erp", "DELETE", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-materials"] }),
  });
}

export function useImportErpMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: ErpMaterialImportRow[]) =>
      apiMutate<ErpMaterialImportResult>("/api/materials/erp/import", "POST", { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-materials"] }),
  });
}
