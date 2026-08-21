"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface DeviceRecord {
  id: string;
  code: string;
  name: string;
  kks: string | null;
  system: string | null;
  systemSeq?: string | null;
  managingPosition: string | null;
  managingPositions?: string[];
  machine?: string;
  qrCardKey?: string;
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

export interface DeviceListMeta {
  total: number;
  totalSystemDevices: number;
  source: string;
}

export interface DeviceWithRelations extends DeviceRecord {
  hasQrCard: boolean;
  qrCardCreatedAt?: string | Date | null;
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
  materialDeclarations: Array<{
    id: string;
    deviceSeq?: string | null;
    deviceId?: string | null;
    machine: string;
    location?: string | null;
    system?: string | null;
    managingPosition?: string | null;
    quantity: number;
    deviceCount: number;
    intervalMonths: number;
    intervalNote?: string | null;
    note?: string | null;
    _count?: { logs: number; defectRequests: number };
    device?: { id: string; code: string; name: string; system: string | null; managingPosition?: string | null } | null;
    material: { id: string; code?: string; name: string; unit: string; machine: string; category?: string | null };
  }>;
  materialUsage: Array<{
    id: string;
    replacedAt: string | Date;
    quantity?: number | null;
    note?: string | null;
    replacement: {
      deviceSeq?: string | null;
      location?: string | null;
      system?: string | null;
      device?: { seq: string; name: string } | null;
      material: { id: string; name: string; unit: string; machine: string; category?: string | null };
    };
  }>;
  currentDefects: Array<{
    id: string;
    unit: string;
    severity?: string | null;
    severityCriteria?: string[];
    content?: string | null;
    status: string;
    requestType?: string | null;
    requestNumber?: string | null;
    detectedAt?: string | Date | null;
    note?: string | null;
    node?: { seq: string; name: string } | null;
    relatedDevices?: Array<{ deviceSeq: string; device: { seq: string; name: string } }>;
  }>;
  defectHistory: Array<{
    id: string;
    unit: string;
    defectContent?: string | null;
    content?: string | null;
    result?: string | null;
    requestType?: string | null;
    requestNumber?: string | null;
    workOrderNumber?: string | null;
    performedAt: string | Date;
    createdBy?: { id: string; name: string } | null;
    node?: { seq: string; name: string } | null;
    relatedDevices?: Array<{ deviceSeq: string; device: { seq: string; name: string } }>;
  }>;
  includesDescendants?: boolean;
  includedDeviceCount?: number;
  includedDescendantDepth?: number;
}

export function useDevices(params: {
  enabled?: boolean;
  permissionScope?: "material-manage" | "replacement-manage";
}) {
  const qs = new URLSearchParams();
  if (params.permissionScope) qs.set("permissionScope", params.permissionScope);
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: ["devices", queryParams],
    queryFn: () => apiGet<DeviceListItem[]>(`/api/devices?${qs.toString()}`) as Promise<{ data: DeviceListItem[]; meta: DeviceListMeta }>,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useDevice(id: string | undefined, machine?: string | null, includeDescendants?: number) {
  const machineParam = machine?.toUpperCase() ?? "";
  const descendantDepth = includeDescendants === undefined
    ? undefined
    : Math.min(3, Math.max(0, Math.trunc(includeDescendants)));
  return useQuery({
    queryKey: ["device", id, machineParam, descendantDepth],
    queryFn: () => {
      const query = new URLSearchParams();
      if (machineParam) query.set("machine", machineParam);
      if (descendantDepth !== undefined) query.set("includeDescendants", String(descendantDepth));
      const suffix = query.size ? `?${query.toString()}` : "";
      return apiGet<DeviceWithRelations>(`/api/devices/${id}${suffix}`);
    },
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
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
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
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
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
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
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
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
    },
  });
}
