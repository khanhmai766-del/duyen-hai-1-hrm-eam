"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type {
  EquipmentDashboardData,
  EquipmentDashboardMeta,
} from "@/types/equipment-dashboard";

type EquipmentDashboardFilters = {
  from?: string;
  to?: string;
};

export function useEquipmentDashboard(filters: EquipmentDashboardFilters = {}) {
  const query = new URLSearchParams();
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const suffix = query.toString();

  return useQuery({
    queryKey: ["equipment-dashboard", filters],
    queryFn: () =>
      apiGet<EquipmentDashboardData>(
        `/api/reports/equipment-dashboard${suffix ? `?${suffix}` : ""}`
      ) as Promise<{
        data: EquipmentDashboardData;
        meta: EquipmentDashboardMeta;
      }>,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}
