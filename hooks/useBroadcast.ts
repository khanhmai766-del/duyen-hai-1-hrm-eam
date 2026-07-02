"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface SystemBroadcast {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useBroadcasts() {
  return useQuery({
    queryKey: ["broadcast"],
    queryFn: () => apiGet<SystemBroadcast[]>("/api/broadcast"),
    staleTime: 60 * 1000,
    // Polling nhẹ để user đang mở web thấy thông báo mới / bị tắt mà không cần F5.
    refetchInterval: 60 * 1000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["broadcast"] });
}

export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; body: string }) => apiMutate<SystemBroadcast>("/api/broadcast", "POST", body),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; title?: string; body?: string; isActive?: boolean }) =>
      apiMutate<SystemBroadcast>("/api/broadcast", "PUT", body),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/broadcast?id=${id}`, "DELETE"),
    onSuccess: () => invalidate(qc),
  });
}
