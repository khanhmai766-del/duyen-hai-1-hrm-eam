"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { MilestoneInput, MilestoneSchedule } from "@/lib/overhaul-milestones";

export function useOverhaulMilestones(enabled = true) {
  return useQuery({
    queryKey: ["overhaul-milestones"],
    enabled,
    queryFn: async () => (await apiGet<MilestoneSchedule>("/api/overhaul-milestones")).data,
    staleTime: 0, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: "always",
  });
}

export function useSaveOverhaulMilestone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MilestoneInput & { id?: string }) => apiMutate("/api/overhaul-milestones", body.id ? "PUT" : "POST", body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["overhaul-milestones"] }),
  });
}

export function useDeleteOverhaulMilestone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate("/api/overhaul-milestones", "DELETE", { id }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["overhaul-milestones"] }),
  });
}
