"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { ShiftId, VibKind } from "@/lib/vibration/constants";
import type { VibrationDeviceDto, VibrationHistoryRow, VibrationRecordDto, VibrationRecordInput } from "@/lib/vibration/types";

export interface VibrationDeviceFilter {
  kind?: "WEEKLY" | "MNK" | "MILL" | "TBNT";
  area?: string;
  active?: "true" | "false" | "all";
  mapStatus?: string;
  group?: string;
  q?: string;
}

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useVibrationDevices(filter: VibrationDeviceFilter = {}, enabled = true) {
  return useQuery({
    queryKey: ["vibration-devices", filter],
    queryFn: () => apiGet<VibrationDeviceDto[]>(`/api/vibration/devices${qs({ ...filter })}`).then((r) => r.data),
    enabled,
    staleTime: 30_000,
  });
}

export function useVibrationRecords(
  params: { kind: VibKind; date: string; shift?: ShiftId; withPrevious?: boolean },
  enabled = true
) {
  return useQuery({
    queryKey: ["vibration-records", params],
    queryFn: () =>
      apiGet<VibrationRecordDto[]>(
        `/api/vibration/records${qs({ kind: params.kind, date: params.date, shift: params.shift, withPrevious: params.withPrevious ? "1" : undefined })}`
      ).then((r) => ({ records: r.data, previous: (r.meta?.previous ?? {}) as Record<string, VibrationRecordDto> })),
    enabled,
  });
}

export function useSaveVibrationRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: "WEEKLY" | "MNK" | "MILL" | "TBNT"; date: string; shift?: ShiftId; items: VibrationRecordInput[] }) =>
      apiMutate<VibrationRecordDto[]>("/api/vibration/records", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vibration-records"] });
      qc.invalidateQueries({ queryKey: ["vibration-history"] });
    },
  });
}

export function useVibrationHistory(equipmentSeq: string | null | undefined, limit = 15) {
  return useQuery({
    queryKey: ["vibration-history", equipmentSeq, limit],
    queryFn: () => apiGet<VibrationHistoryRow[]>(`/api/vibration/history${qs({ equipmentSeq: equipmentSeq ?? "", limit: String(limit) })}`).then((r) => r.data),
    enabled: !!equipmentSeq,
    staleTime: 60_000,
  });
}

export type VibrationMappingAction =
  | { action: "set"; deviceId: string; equipmentSeq: string }
  | { action: "confirm" | "clear" | "useSuggestion"; deviceId: string }
  | { action: "bulkSuggestions"; minScore: number; deviceIds?: string[] }
  | { action: "auto" };

export function useVibrationMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VibrationMappingAction) =>
      apiMutate<VibrationDeviceDto | { confirmed: number } | { considered: number; auto: number; none: number; skippedConfirmed: number }>("/api/vibration/mapping", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vibration-devices"] });
      qc.invalidateQueries({ queryKey: ["vibration-history"] });
    },
  });
}

/** Lấy số đo theo yêu cầu (dùng cho xuất Excel/PDF/ảnh): một ngày (+ ca) hoặc khoảng `from`–`to` (tối đa 400 ngày). */
export async function fetchVibrationRecords(params: { kind: VibKind; date?: string; from?: string; to?: string; shift?: ShiftId }) {
  const r = await apiGet<VibrationRecordDto[]>(`/api/vibration/records${qs({ kind: params.kind, date: params.date, from: params.from, to: params.to, shift: params.shift })}`);
  return r.data;
}
