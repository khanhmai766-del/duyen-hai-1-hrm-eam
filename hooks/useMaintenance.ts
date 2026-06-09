"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { MaintenancePlan, MaintenanceRecord } from "@prisma/client";

export interface MaintenancePlanItem extends MaintenancePlan {
  device: { id: string; code: string; name: string; category: string; location: string };
  assignee: { id: string; name: string; position: string | null } | null;
  _count: { records: number };
}

export interface MaintenancePlanDetail extends MaintenancePlan {
  device: { id: string; code: string; name: string; category: string; location: string };
  assignee: { id: string; name: string; position: string | null } | null;
  records: (MaintenanceRecord & { doneBy: { id: string; name: string; position: string | null } })[];
}

export interface MaintenanceFilters {
  q?: string;
  deviceId?: string;
  due?: string;
}

export function useMaintenancePlans(filters: MaintenanceFilters = {}) {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.deviceId) qs.set("deviceId", filters.deviceId);
  if (filters.due && filters.due !== "ALL") qs.set("due", filters.due);
  return useQuery({
    queryKey: ["maintenance", filters],
    queryFn: () => apiGet<MaintenancePlanItem[]>(`/api/maintenance?${qs.toString()}`),
  });
}

export function useMaintenancePlan(id: string | undefined) {
  return useQuery({
    queryKey: ["maintenance-plan", id],
    queryFn: () => apiGet<MaintenancePlanDetail>(`/api/maintenance/${id}`),
    enabled: !!id,
  });
}

export type MaintenanceInput = Record<string, unknown>;

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["maintenance"] });
  qc.invalidateQueries({ queryKey: ["device"] });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaintenanceInput) => apiMutate<MaintenancePlanItem>("/api/maintenance", "POST", body),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: MaintenanceInput & { id: string }) =>
      apiMutate<MaintenancePlanItem>(`/api/maintenance/${id}`, "PUT", body),
    onSuccess: (_d, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["maintenance-plan", vars.id] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/maintenance/${id}`, "DELETE"),
    onSuccess: () => invalidate(qc),
  });
}

export function useCompletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: MaintenanceInput & { id: string }) =>
      apiMutate<MaintenancePlanItem>(`/api/maintenance/${id}/complete`, "POST", body),
    onSuccess: (_d, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["maintenance-plan", vars.id] });
    },
  });
}
