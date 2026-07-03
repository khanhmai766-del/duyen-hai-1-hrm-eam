"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface ForumAuthor {
  id: string;
  name: string;
  position: string | null;
  avatarUrl: string | null;
}

export interface ForumReply {
  id: string;
  content: string;
  attachments: string[];
  createdAt: string;
  author: ForumAuthor;
}

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  attachments: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: ForumAuthor;
  replies: ForumReply[];
  likeCount: number;
  likedByMe: boolean;
}

export interface ForumFilters {
  category?: string;
  q?: string;
}

export interface ForumPostInput {
  title: string;
  content: string;
  category: string;
  tags?: string[];
  attachments?: string[];
}

export function useForumPosts(filters: ForumFilters) {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== "ALL") params.set("category", filters.category);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  const qs = params.toString();
  return useQuery({
    queryKey: ["forum-posts", filters],
    queryFn: () => apiGet<ForumPost[]>(`/api/forum${qs ? `?${qs}` : ""}`),
  });
}

export function useCreateForumPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ForumPostInput) => apiMutate<{ id: string }>("/api/forum", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useCreateForumReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, content, attachments }: { postId: string; content: string; attachments?: string[] }) =>
      apiMutate<{ id: string }>(`/api/forum/${postId}/replies`, "POST", { content, attachments }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useUpdateForumPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<ForumPostInput> & { isPinned?: boolean }) =>
      apiMutate<{ id: string }>(`/api/forum/${id}`, "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useUpdateForumReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, attachments }: { id: string; content: string; attachments?: string[] }) =>
      apiMutate<{ id: string }>(`/api/forum/replies/${id}`, "PUT", { content, attachments }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useToggleForumLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiMutate<{ liked: boolean }>(`/api/forum/${postId}/likes`, "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useDeleteForumPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/forum/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useDeleteForumReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/forum/replies/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}
