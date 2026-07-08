"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { DeviceListItem } from "@/hooks/useDevices";

/** Danh sách thiết bị đã được chọn tạo thẻ QR (tab "Thẻ" — chỉ thiết bị quan trọng). */
export function useDeviceQrCards(params: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["device-qr-cards"],
    queryFn: () => apiGet<DeviceListItem[]>("/api/device-qr-cards"),
    enabled: params.enabled ?? true,
  });
}

export function useAddDeviceQrCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceSeq: string) => apiMutate("/api/device-qr-cards", "POST", { deviceSeq }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device-qr-cards"] }),
  });
}

export function useRemoveDeviceQrCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceSeq: string) => apiMutate(`/api/device-qr-cards?seq=${encodeURIComponent(deviceSeq)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device-qr-cards"] }),
  });
}
