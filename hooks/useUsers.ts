"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { SafeUser } from "@/types";

/**
 * Danh sách người dùng bản "nhẹ" (không kèm chữ ký base64; avatar qua proxy S3).
 * Đây là bản dùng mặc định cho hầu hết UI (sidebar, dropdown, chọn người, chức vụ).
 */
export function useUsers(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["users", "summary"],
    queryFn: () => apiGet<SafeUser[]>("/api/users?summary=1"),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Bản đầy đủ (kèm avatarUrl/signatureUrl base64) — CHỈ dùng ở trang cần chữ ký,
 * ví dụ Quản trị người dùng. Query key ["users"] vẫn được làm mới bởi các mutation
 * invalidate ["users"] (khớp tiền tố, gồm cả ["users","summary"]).
 */
export function useUsersFull() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SafeUser[]>("/api/users"),
    staleTime: 60 * 1000,
  });
}

export function useMeProfile(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SafeUser>("/api/me"),
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Danh sách "Chức vụ" phân biệt (bỏ trùng, đã sắp xếp) lấy từ người dùng. */
export function usePositions(options: { enabled?: boolean } = {}): string[] {
  const { data } = useUsers(options);
  return React.useMemo(() => {
    const set = new Set<string>();
    for (const u of data?.data ?? []) {
      for (const value of [u.position, u.secondaryPosition]) {
        const p = (value ?? "").trim();
        if (p) set.add(p);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [data]);
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiMutate<SafeUser>("/api/users", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string } & Record<string, unknown>) => apiMutate<SafeUser>("/api/users", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string; deactivated?: boolean; message?: string; permanent?: boolean }>(`/api/users?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function usePermanentDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; confirmation: string }) =>
      apiMutate<{ id: string; permanent: boolean }>(`/api/users?id=${body.id}&permanent=true`, "DELETE", { confirmation: body.confirmation }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiMutate<SafeUser>("/api/me", "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

export function useReport<T = any>(type: string, params: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return useQuery({
    queryKey: ["report", type, params],
    queryFn: () => apiGet<T>(`/api/reports/${type}?${qs.toString()}`),
  });
}
