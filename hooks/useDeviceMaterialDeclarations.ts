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
}

export function useDeviceMaterialOptions(deviceSeq: string, machine: string, enabled = true) {
  return useQuery({
    queryKey: ["device-material-options", deviceSeq, machine],
    queryFn: () =>
      apiGet<DeviceMaterialOption[]>(
        `/api/device-material-declarations?deviceSeq=${encodeURIComponent(deviceSeq)}&machine=${encodeURIComponent(machine)}`
      ),
    enabled: enabled && Boolean(deviceSeq && machine),
    staleTime: 5 * 60 * 1000,
  });
}

export type DeviceMaterialDeclarationInput = {
  deviceSeq: string;
  materialId: string;
  machine: string;
  system?: string | null;
  location?: string | null;
  managingPosition?: string | null;
  quantity: number;
  deviceCount: number;
  intervalMonths: number;
  intervalNote?: string | null;
  lastReplacedAt?: string | null;
  note?: string | null;
};

export function useCreateDeviceMaterialDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceMaterialDeclarationInput) =>
      apiMutate("/api/device-material-declarations", "POST", body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["device", variables.deviceSeq] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["replacements"] });
    },
  });
}
