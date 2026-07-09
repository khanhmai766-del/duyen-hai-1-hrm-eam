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
  postId: string;
  parentReplyId?: string | null;
  content: string;
  attachments: string[];
  createdAt: string;
  author: ForumAuthor;
  likeCount?: number;
  likedByMe?: boolean;
  parentReply?: {
    id: string;
    content: string;
    createdAt: string;
    author: ForumAuthor;
  } | null;
}

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  attachments: string[];
  targetPositions: string[];
  isPinned: boolean;
  closeSummary: string | null;
  closedAt: string | null;
  closedBy: ForumAuthor | null;
  createdAt: string;
  updatedAt: string;
  author: ForumAuthor;
  replyAuthorIds: string[];
  latestReply: ForumReply | null;
  replyCount: number;
  likeCount: number;
  likedByMe: boolean;
}

export interface ForumFilters {
  category?: string;
  q?: string;
  status?: "OPEN" | "CLOSED";
}

export interface ForumPostInput {
  title: string;
  content: string;
  category: string;
  tags?: string[];
  attachments?: string[];
  targetPositions?: string[];
}

export function useForumPosts(filters: ForumFilters) {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== "ALL") params.set("category", filters.category);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ["forum-posts", filters],
    queryFn: () => apiGet<ForumPost[]>(`/api/forum${qs ? `?${qs}` : ""}`),
    refetchInterval: 60 * 1000,
  });
}

export function useForumReplies(postId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["forum-replies", postId],
    queryFn: () => apiGet<ForumReply[]>(`/api/forum/${postId}/replies`),
    enabled: enabled && !!postId,
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
    mutationFn: ({ postId, content, attachments, parentReplyId }: { postId: string; content: string; attachments?: string[]; parentReplyId?: string | null }) =>
      apiMutate<{ id: string }>(`/api/forum/${postId}/replies`, "POST", { content, attachments, parentReplyId }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["forum-posts"] });
      qc.invalidateQueries({ queryKey: ["forum-replies", variables.postId] });
    },
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

export function useCloseForumPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, closeSummary }: { id: string; closeSummary: string }) =>
      apiMutate<{ id: string }>(`/api/forum/${id}`, "PUT", { action: "CLOSE", closeSummary }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useUpdateForumReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, attachments }: { id: string; content: string; attachments?: string[] }) =>
      apiMutate<{ id: string }>(`/api/forum/replies/${id}`, "PUT", { content, attachments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-posts"] });
      qc.invalidateQueries({ queryKey: ["forum-replies"] });
    },
  });
}

export function useToggleForumLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiMutate<{ liked: boolean }>(`/api/forum/${postId}/likes`, "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-posts"] }),
  });
}

export function useToggleForumReplyLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (replyId: string) => apiMutate<{ liked: boolean }>(`/api/forum/replies/${replyId}/likes`, "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-replies"] }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forum-posts"] });
      qc.invalidateQueries({ queryKey: ["forum-replies"] });
    },
  });
}
