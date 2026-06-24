"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { PositionSystemScope } from "@/lib/position-system-scopes";

export function usePositionSystemScopes() {
  return useQuery({
    queryKey: ["position-system-scopes"],
    queryFn: () => apiGet<PositionSystemScope[]>("/api/position-system-scopes"),
  });
}

export function useUpdatePositionSystemScope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { position: string; systemSeqs: string[] }) =>
      apiMutate<PositionSystemScope[]>("/api/position-system-scopes", "PUT", body),
    onSuccess: (data) => {
      queryClient.setQueryData(["position-system-scopes"], { data, meta: null });
      queryClient.invalidateQueries({ queryKey: ["position-system-scopes"] });
    },
  });
}
