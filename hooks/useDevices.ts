"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { DeviceWithRelations, Device } from "@/types";

export interface DeviceListItem extends Device {
  repairLogs: { startedAt: string }[];
  _count: { repairLogs: number };
}

export function useDevices(params: { q?: string; system?: string }) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.system) qs.set("system", params.system);
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
    mutationFn: (body: DeviceInput) => apiMutate<Device>("/api/devices", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DeviceInput & { id: string }) =>
      apiMutate<Device>(`/api/devices/${id}`, "PUT", body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["device", vars.id] });
    },
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/devices/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
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
    mutationFn: (rows: Array<{ code: string; name?: string; system?: string }>) =>
      apiMutate<ImportResult>("/api/devices/import", "POST", { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}
