"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { WorkTaskLink } from "@/lib/work-task";

export interface WorkTaskAssignee {
  id: string;
  name: string;
  position: string;
}

export interface WorkTask {
  id: string;
  taskDate: string;
  content: string;
  director: string;
  dueDate: string | null;
  report: string | null;
  reportUpdatedAt: string | null;
  reportUpdatedById: string | null;
  note: string | null;
  links: WorkTaskLink[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  assignees: WorkTaskAssignee[];
}

export interface WorkTaskInput {
  taskDate: string;
  content: string;
  director: string;
  dueDate: string | null;
  assigneeIds: string[];
  note: string | null;
  links: string[];
}

const KEY = ["work-tasks"] as const;

/** month = "YYYY-MM"; chuỗi rỗng = tất cả. */
export function useWorkTasks(month: string) {
  return useQuery({
    queryKey: [...KEY, month || "ALL"],
    queryFn: () => apiGet<WorkTask[]>(month ? `/api/work-tasks?month=${month}` : "/api/work-tasks"),
    staleTime: 30 * 1000,
  });
}

export function useCreateWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkTaskInput) => apiMutate<WorkTask>("/api/work-tasks", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    // `report` chỉ Quản trị gửi được (máy chủ từ chối với vai trò khác).
    mutationFn: ({ id, ...body }: { id: string; report?: string } & Partial<WorkTaskInput>) =>
      apiMutate<WorkTask>(`/api/work-tasks/${encodeURIComponent(id)}`, "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReportWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; report: string; note?: string | null; links?: string[] }) =>
      apiMutate<WorkTask>(`/api/work-tasks/${encodeURIComponent(id)}`, "PUT", { action: "REPORT", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/work-tasks/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
