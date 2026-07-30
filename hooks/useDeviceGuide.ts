"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface DeviceGuideDoc {
  url: string | null;
  name?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

/** Tệp PDF hướng dẫn tạo mới thiết bị (dùng chung thư mục S3 với lịch trực ca). */
export function useDeviceGuide(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["device-guide"],
    queryFn: () => apiGet<DeviceGuideDoc>("/api/device-guide"),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

/** Tải lên tài liệu hướng dẫn mới — multipart nên không đi qua apiMutate. */
export function useUploadDeviceGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/device-guide", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Tải lên thất bại");
      return json.data as DeviceGuideDoc;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device-guide"] }),
  });
}

/** Gỡ tài liệu hướng dẫn hiện tại. */
export function useDeleteDeviceGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiMutate("/api/device-guide", "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["device-guide"] }),
  });
}
