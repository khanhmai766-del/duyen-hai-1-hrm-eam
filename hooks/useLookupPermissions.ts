"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { LookupModuleId } from "@/lib/lookup-access";

export type LookupAccount = { id: string; name: string; employeeId: string; email: string; isActive: boolean; modules: LookupModuleId[] };
export function useLookupPermissions(enabled: boolean) {
  return useQuery({ queryKey: ["lookup-permissions"], queryFn: () => apiGet<LookupAccount[]>("/api/lookup-permissions"), enabled });
}
export function useSaveLookupPermissions() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { userIds: string[]; modules: LookupModuleId[] }) => apiMutate("/api/lookup-permissions", "PUT", body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["lookup-permissions"] }); void qc.invalidateQueries({ queryKey: ["rbac-me"] }); } });
}
