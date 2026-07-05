"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { MaterialReplacement, MaterialReplacementLog } from "@prisma/client";

export type ReplacementDevice = { id: string; code: string; name: string; system: string | null; managingPosition?: string | null };
export type ReplacementMaterial = {
  id: string;
  code: string;
  name: string;
  unit: string;
  imageUrl?: string | null;
  system: string | null;
  deviceMaterials?: Array<{ device: ReplacementDevice }>;
};

export interface ReplacementItem extends MaterialReplacement {
  deviceId?: string | null;
  material: ReplacementMaterial & { imageUrl: string | null };
  device: ReplacementDevice | null;
  _count: { logs: number };
}

export interface ReplacementDetail extends MaterialReplacement {
  deviceId?: string | null;
  material: { id: string; code: string; name: string; unit: string; imageUrl: string | null };
  device: ReplacementDevice | null;
  logs: (MaterialReplacementLog & { doneBy: { id: string; name: string; position: string | null; avatarUrl: string | null } })[];
}

export interface ReplacementFilters {
  q?: string;
  materialId?: string;
  due?: string; // OVERDUE | DUE_SOON | OK | WARN | ALL
}

export interface ReplacementLogItem extends MaterialReplacementLog {
  doneBy: { id: string; name: string; position: string | null; avatarUrl: string | null };
  replacement: {
    system: string | null;
    intervalMonths: number;
    intervalNote: string | null;
    device: ReplacementDevice | null;
    material: ReplacementMaterial;
  } | null;
}

export function useReplacementHistory(filters: { q?: string } = {}) {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  return useQuery({
    queryKey: ["replacement-history", filters],
    queryFn: () => apiGet<ReplacementLogItem[]>(`/api/material-replacements/history?${qs.toString()}`),
  });
}

export interface ReplacementMeta {
  total: number;
  counts: { OVERDUE: number; DUE_SOON: number; OK: number };
  warn: number;
}

export function useReplacements(filters: ReplacementFilters = {}) {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.materialId) qs.set("materialId", filters.materialId);
  if (filters.due && filters.due !== "ALL") qs.set("due", filters.due);
  return useQuery({
    queryKey: ["replacements", filters],
    queryFn: () => apiGet<ReplacementItem[]>(`/api/material-replacements?${qs.toString()}`),
  });
}

/** Cảnh báo thay thế: các điểm quá hạn hoặc sắp đến hạn (≤ 1 tháng). */
export function useReplacementAlerts() {
  return useQuery({
    queryKey: ["replacements", { due: "WARN" }],
    queryFn: () => apiGet<ReplacementItem[]>(`/api/material-replacements?due=WARN`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useReplacement(id: string | undefined) {
  return useQuery({
    queryKey: ["replacement", id],
    queryFn: () => apiGet<ReplacementDetail>(`/api/material-replacements/${id}`),
    enabled: !!id,
  });
}

export type ReplacementInput = Record<string, unknown>;

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["replacements"] });
  qc.invalidateQueries({ queryKey: ["replacement-history"] });
  qc.invalidateQueries({ queryKey: ["materials"] });
}

export function useUpdateReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReplacementInput & { id: string }) =>
      apiMutate<ReplacementItem>(`/api/material-replacements/${id}`, "PUT", body),
    onSuccess: (_d, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["replacement", vars.id] });
    },
  });
}

export function useDeleteReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/material-replacements/${id}`, "DELETE"),
    onSuccess: () => invalidate(qc),
  });
}

export function useRecordReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReplacementInput & { id: string }) =>
      apiMutate<ReplacementItem>(`/api/material-replacements/${id}/replace`, "POST", body),
    onSuccess: (_d, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["replacement", vars.id] });
    },
  });
}
