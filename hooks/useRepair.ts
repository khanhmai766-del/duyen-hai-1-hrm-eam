"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { RepairLogWithRelations, RepairLog } from "@/types";

export interface RepairFilters {
  deviceId?: string;
  status?: string;
  priority?: string;
  technicianId?: string;
  from?: string;
  to?: string;
}

export function useRepairLogs(filters: RepairFilters = {}) {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  return useQuery({
    queryKey: ["repairs", filters],
    queryFn: () => apiGet<RepairLogWithRelations[]>(`/api/repair-history?${qs.toString()}`),
  });
}

export function useCreateRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<RepairLog>) => apiMutate<RepairLog>("/api/repair-history", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useUpdateRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => apiMutate<RepairLog>(`/api/repair-history/${id}`, "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }),
  });
}

export function useDeleteRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/repair-history/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }),
  });
}
