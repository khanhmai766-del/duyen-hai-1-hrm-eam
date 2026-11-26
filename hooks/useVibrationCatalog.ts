"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { DevicePatch } from "@/lib/vibration/catalog";
import type { VibrationDeviceDto } from "@/lib/vibration/types";

export type VibrationDeviceDetail = VibrationDeviceDto & { recordCount: number };
export type BulkItem = DevicePatch & { id: string };

/** Số bản ghi đo theo id thiết bị (chỉ thiết bị có bản ghi). */
export function useVibrationRecordCounts(enabled = true) {
  return useQuery({
    queryKey: ["vibration-record-counts"],
    queryFn: () => apiGet<Record<string, number>>("/api/vibration/devices/bulk").then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

export function useVibrationDevice(id: string | null) {
  return useQuery({
    queryKey: ["vibration-device", id],
    queryFn: () => apiGet<VibrationDeviceDetail>(`/api/vibration/devices/${encodeURIComponent(id!)}`).then((r) => r.data),
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["vibration-devices"] });
    qc.invalidateQueries({ queryKey: ["vibration-device"] });
    qc.invalidateQueries({ queryKey: ["vibration-record-counts"] });
  };
}

export function useCreateVibrationDevice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: DevicePatch & { area: string; name: string }) => apiMutate<VibrationDeviceDto>("/api/vibration/devices/new", "POST", body),
    onSuccess: invalidate,
  });
}

export function useUpdateVibrationDevice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DevicePatch }) =>
      apiMutate<VibrationDeviceDto>(`/api/vibration/devices/${encodeURIComponent(id)}`, "PATCH", patch),
    onSuccess: invalidate,
  });
}

export function useDeleteVibrationDevice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/vibration/devices/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: invalidate,
  });
}

/** Lưu nhiều thiết bị (cắt lô 500 mục/lần). */
export function useBulkUpdateVibrationDevices() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (items: BulkItem[]) => {
      let updated = 0;
      for (let i = 0; i < items.length; i += 500) {
        const r = await apiMutate<{ updated: number }>("/api/vibration/devices/bulk", "PATCH", { items: items.slice(i, i + 500) });
        updated += r.updated;
      }
      return { updated };
    },
    onSuccess: invalidate,
  });
}
