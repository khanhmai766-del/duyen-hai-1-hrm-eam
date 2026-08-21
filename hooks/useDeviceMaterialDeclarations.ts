"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface DeviceMaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  machine: string;
  quantity: number;
  materialIdsByMachine: Record<string, string>;
  machines: string[];
}

export function useDeviceMaterialOptions(deviceSeq: string, machines: string[], enabled = true) {
  const machineKey = machines.join(",");
  return useQuery({
    queryKey: ["device-material-options", deviceSeq, machineKey],
    queryFn: () =>
      apiGet<DeviceMaterialOption[]>(
        `/api/device-material-declarations?deviceSeq=${encodeURIComponent(deviceSeq)}&machines=${encodeURIComponent(machineKey)}`
      ),
    enabled: enabled && Boolean(deviceSeq && machines.length),
    // Luôn tải mới khi mở dialog — danh mục có thể vừa được bổ sung (kể cả từ máy khác),
    // payload chỉ vài chục dòng nên không đáng kể.
    staleTime: 0,
  });
}

export type DeviceMaterialDeclarationInput = {
  deviceSeq: string;
  materialId: string;
  machine?: string;
  machines: string[];
  materialIdsByMachine: Record<string, string>;
  system?: string | null;
  location?: string | null;
  managingPosition?: string | null;
  quantity: number;
  deviceCount: number;
  intervalMonths: number;
  intervalNote?: string | null;
  lastReplacedAt?: string | null;
  note?: string | null;
  recoveryOnSupplement?: boolean;
};

export function useCreateDeviceMaterialDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceMaterialDeclarationInput) =>
      apiMutate("/api/device-material-declarations", "POST", body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["device", variables.deviceSeq] }),
        qc.invalidateQueries({ queryKey: ["materials"] }),
        qc.invalidateQueries({ queryKey: ["replacements"] }),
        qc.invalidateQueries({ queryKey: ["material-ticket-options"] }),
      ]);
    },
  });
}

export type DeviceMaterialDeclarationUpdateInput = {
  id: string;
  deviceSeq: string;
  materialId: string;
  machines?: string[];
  materialIdsByMachine?: Record<string, string>;
  system?: string | null;
  location?: string | null;
  managingPosition?: string | null;
  quantity: number;
  deviceCount: number;
  intervalMonths: number;
  intervalNote?: string | null;
  note?: string | null;
  recoveryOnSupplement?: boolean;
};

export function useUpdateDeviceMaterialDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deviceSeq, ...body }: DeviceMaterialDeclarationUpdateInput) =>
      body.machines && body.machines.length > 1
        ? apiMutate("/api/device-material-declarations", "PUT", { id, deviceSeq, ...body })
        : apiMutate(`/api/material-replacements/${encodeURIComponent(id)}`, "PUT", body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["device", variables.deviceSeq] }),
        qc.invalidateQueries({ queryKey: ["materials"] }),
        qc.invalidateQueries({ queryKey: ["replacements"] }),
        qc.invalidateQueries({ queryKey: ["material-ticket-options"] }),
      ]);
    },
  });
}
