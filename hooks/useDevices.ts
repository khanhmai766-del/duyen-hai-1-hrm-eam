"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  system: string | null;
  systemSeq?: string | null;
  managingPosition: string | null;
  images: string[];
  attachedInfo: string | null;
  documentUrl: string | null;
  qrCodeData: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceListItem extends DeviceRecord {
  repairLogs: { startedAt: string }[];
  _count: { repairLogs: number };
}

export interface DeviceWithRelations extends DeviceRecord {
  repairLogs: Array<{
    id?: string;
    status?: string | null;
    downtime?: number | null;
    startedAt?: string | Date | null;
    [key: string]: unknown;
  }>;
  materials: Array<{
    id?: string;
    material?: { name?: string | null; supplier?: string | null };
    [key: string]: unknown;
  }>;
}

export function useDevices(params: { q?: string; system?: string; systemSeq?: string }) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.system) qs.set("system", params.system);
  if (params.systemSeq) qs.set("systemSeq", params.systemSeq);
  return useQuery({
    queryKey: ["devices", params],
    queryFn: () => apiGet<DeviceListItem[]>(`/api/devices?${qs.toString()}`),
  });
}

export function useDevice(id: string | undefined) {
  return useQuery({
    queryKey: ["device", id],
    queryFn: () => apiGet<DeviceWithRelations>(`/api/devices/${id}`),
    enabled: !!id,
  });
}

// Form payloads use string dates / partial fields, so accept a loose input shape.
export type DeviceInput = Record<string, unknown>;

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceInput) => apiMutate<DeviceRecord>("/api/devices", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
    },
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DeviceInput & { id: string }) =>
      apiMutate<DeviceRecord>(`/api/devices/${id}`, "PUT", body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["device", vars.id] });
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
    },
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/devices/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
    },
  });
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: string[];
}

export function useImportDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Array<{ code: string; name?: string; system?: string; systemSeq?: string }>) =>
      apiMutate<ImportResult>("/api/devices/import", "POST", { rows }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
    },
  });
}
