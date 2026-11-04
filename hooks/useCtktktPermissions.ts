"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { PositionGrants, PositionPermissionConfig } from "@/modules/ctktkt/lib/auth/position-permissions";

export type CtktktPermissionSettings = PositionPermissionConfig & { defaults: PositionGrants; positions: string[]; updatedAt: string | null };
const key = ["ctktkt", "position-permissions"] as const;
export function useCtktktPermissions() {
  return useQuery({ queryKey: key, queryFn: async ({ signal }) => (await apiGet<CtktktPermissionSettings>("/api/ctktkt/permissions", { signal })).data, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
export function useSaveCtktktPermissions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { grants: PositionGrants; expectedVersion: number }) => apiMutate<PositionPermissionConfig>("/api/ctktkt/permissions", "PUT", body),
    onSuccess: async config => {
      client.setQueryData<CtktktPermissionSettings>(key, previous => previous ? { ...previous, ...config, updatedAt: new Date().toISOString() } : previous);
      await client.invalidateQueries({ queryKey: ["ctktkt"], refetchType: "none" });
    },
  });
}
