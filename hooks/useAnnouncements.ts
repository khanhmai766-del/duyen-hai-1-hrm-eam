"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type AnnouncementCategory = "BULLETIN" | "ORDER";

// Chỉ userId + readAt — tên/chức vụ người đọc map từ danh sách user đã cache ở client.
export interface AnnouncementReader {
  userId: string;
  readAt: string;
}

export interface Announcement {
  id: string;
  category: AnnouncementCategory;
  classification: string | null;
  stt: string | null;
  title: string;
  body: string;
  pinned: boolean;
  orderedBy: string | null;
  issuedAt: string | null;
  invalidatedAt: string | null;
  linkUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
  reads: AnnouncementReader[];
}

interface AnnouncementInput {
  title: string;
  body: string;
  category?: AnnouncementCategory;
  classification?: string | null;
  stt?: string | null;
  pinned?: boolean;
  orderedBy?: string | null;
  issuedAt?: string | null;
  invalidatedAt?: string | null;
  linkUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
}

/**
 * Danh sách mệnh lệnh, lọc năm phía server để chặn payload phình theo thời gian.
 * Mặc định: năm hiện tại. Truyền "ALL" để tải tất cả các năm (vd theo deep-link).
 * meta.years = các năm có dữ liệu (cho dropdown lọc năm).
 */
export function useAnnouncements(year?: string) {
  const activeYear = year ?? String(new Date().getFullYear());
  return useQuery({
    queryKey: ["announcements", activeYear],
    queryFn: () =>
      apiGet<Announcement[]>(
        activeYear === "ALL" ? "/api/announcements" : `/api/announcements?year=${activeYear}`
      ),
    staleTime: 60 * 1000,
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnnouncementInput) => apiMutate("/api/announcements", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string } & Partial<AnnouncementInput>) =>
      apiMutate("/api/announcements", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useInvalidateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate("/api/announcements", "PUT", { id, action: "INVALIDATE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useRestoreAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate("/api/announcements", "PUT", { id, action: "RESTORE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

/** Upload a PDF attachment; returns its public URL + original name. */
export function useUploadAnnouncementFile() {
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string; name: string }> => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/announcements/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Tải tệp thất bại");
      return json.data;
    },
  });
}

/** Xác nhận đã đọc một thông báo/mệnh lệnh (mọi user). */
export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  return useMutation({
    mutationFn: (announcementId: string) => apiMutate("/api/announcements/read", "POST", { announcementId }),
    onMutate: async (announcementId: string) => {
      await qc.cancelQueries({ queryKey: ["announcements"] });
      // Cập nhật lạc quan trên mọi query năm đang cache (["announcements", <năm>]).
      const previous = qc.getQueriesData<{ data: Announcement[]; meta: any }>({ queryKey: ["announcements"] });
      const userId = session?.user?.id;
      if (userId) {
        qc.setQueriesData<{ data: Announcement[]; meta: any }>({ queryKey: ["announcements"] }, (cached) => {
          if (!cached?.data) return cached;
          return {
            ...cached,
            data: cached.data.map((item) => {
              if (item.id !== announcementId || item.reads.some((read) => read.userId === userId)) return item;
              return { ...item, reads: [...item.reads, { userId, readAt: new Date().toISOString() }] };
            }),
          };
        });
      }
      return { previous };
    },
    onError: (_error, _announcementId, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/announcements?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}
