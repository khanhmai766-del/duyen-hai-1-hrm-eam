"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { SafeUser } from "@/types";
import { uniqueVietnamesePositions } from "@/lib/positions";

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

type AdminUsersParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  position?: string;
  enabled?: boolean;
};

export type AdminUsersPage = {
  rows: SafeUser[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Bản đầy đủ legacy. Giữ lại cho tương thích, nhưng chỉ chạy khi caller bật enabled.
 */
export function useUsersFull(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SafeUser[]>("/api/users"),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useAdminUsers(params: AdminUsersParams = {}) {
  const { enabled = true, page = 1, pageSize = 10, q = "", position = "ALL" } = params;
  return useQuery({
    queryKey: ["admin-users", { page, pageSize, q, position }],
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      if (q.trim()) qs.set("q", q.trim());
      if (position && position !== "ALL") qs.set("position", position);
      return apiGet<AdminUsersPage>(`/api/admin/users?${qs.toString()}`);
    },
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useAdminUserDetail(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => apiGet<SafeUser>(`/api/admin/users/${id}`),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
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
    const values: Array<string | null | undefined> = [];
    for (const u of data?.data ?? []) {
      for (const value of [u.position, u.secondaryPosition, u.secondaryPosition2]) {
        values.push(value);
      }
    }
    // Bỏ trùng không phân biệt hoa/thường và dấu tiếng Việt, nhưng giữ nguyên
    // nhãn đã lưu đầu tiên để không thay đổi dữ liệu/phân quyền hiện hữu.
    return uniqueVietnamesePositions(values).sort((a, b) => a.localeCompare(b, "vi"));
  }, [data]);
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiMutate<SafeUser>("/api/users", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string } & Record<string, unknown>) => apiMutate<SafeUser>("/api/users", "PUT", body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user", body.id] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string; deactivated?: boolean; message?: string; permanent?: boolean }>(`/api/users?id=${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export function usePermanentDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; confirmation: string }) =>
      apiMutate<{ id: string; permanent: boolean }>(`/api/users?id=${body.id}&permanent=true`, "DELETE", { confirmation: body.confirmation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
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
