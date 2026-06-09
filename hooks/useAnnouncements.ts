"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type AnnouncementCategory = "BULLETIN" | "ORDER";

export interface AnnouncementReader {
  userId: string;
  readAt: string;
  user: { name: string; position: string | null; avatarUrl: string | null };
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
  linkUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: () => apiGet<Announcement[]>("/api/announcements"),
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
  return useMutation({
    mutationFn: (announcementId: string) => apiMutate("/api/announcements/read", "POST", { announcementId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/announcements?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}
