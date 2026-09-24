"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { SootBlowerDept } from "@/lib/soot-blower-layout";

export type SootBlowerStatus = "available" | "unavailable";

export interface SootBlower {
  id: string;
  machine: string;
  tag: string;
  status: SootBlowerStatus;
  updatedBy: string | null;
  updatedAt: string;
}

export interface SootBlowerDefect {
  id: string;
  machine: string;
  tag: string;
  dept: SootBlowerDept;
  description: string;
  reportedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export function useSootBlowers(machine: string) {
  return useQuery({
    queryKey: ["soot-blowers", machine],
    queryFn: async () => {
      const res = await apiGet<{ blowers: SootBlower[]; defects: SootBlowerDefect[] }>(
        `/api/soot-blowers?machine=${machine}`
      );
      return res.data;
    },
  });
}

export function useSetSootBlowerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { machine: string; tag: string; status: SootBlowerStatus }) =>
      apiMutate<SootBlower>("/api/soot-blowers", "PUT", body),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["soot-blowers", vars.machine] }),
  });
}

export function useAddSootBlowerDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { machine: string; tag: string; dept: SootBlowerDept; description: string; reportedBy?: string }) =>
      apiMutate<SootBlowerDefect>("/api/soot-blowers/defects", "POST", body),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["soot-blowers", vars.machine] }),
  });
}

export function useResolveSootBlowerDefect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { machine: string; id: string }) =>
      apiMutate<SootBlowerDefect>(`/api/soot-blowers/defects/${vars.id}`, "PATCH", {}),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["soot-blowers", vars.machine] }),
  });
}
