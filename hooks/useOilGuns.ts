"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface OilGun {
  id: string;
  machine: string;
  code: string;
  wall: "REAR" | "FRONT";
  position: number;
  status: "available" | "unavailable";
  defect: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface OilGunSummary {
  total: number;
  available: number;
  defective: number;
  unavailable: number;
}

export function useOilGuns(machine: string) {
  return useQuery({
    queryKey: ["oil-guns", machine],
    queryFn: async () => {
      const res = await apiGet<OilGun[]>(`/api/oil-guns?machine=${machine}`);
      return { guns: res.data, summary: res.meta?.summary as OilGunSummary | undefined };
    },
  });
}

export interface OilGunUpdate {
  machine: string;
  code: string;
  status?: "available" | "unavailable";
  defect?: string | null;
}

export function useUpdateOilGun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OilGunUpdate) => apiMutate<OilGun>("/api/oil-guns", "PUT", body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["oil-guns", vars.machine] }),
  });
}
