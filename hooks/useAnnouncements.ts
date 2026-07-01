"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type AnnouncementCategory = "BULLETIN" | "ORDER";

export interface AnnouncementReader {
  userId: string;
  readAt: string;
  user: { name: string; position: string | null; secondaryPosition?: string | null; currentPosition?: string | null; avatarUrl: string | null };
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
      const previous = qc.getQueryData<{ data: Announcement[]; meta: any }>(["announcements"]);
      const userId = session?.user?.id;
      if (previous?.data && userId) {
        qc.setQueryData<{ data: Announcement[]; meta: any }>(["announcements"], {
          ...previous,
          data: previous.data.map((item) => {
            if (item.id !== announcementId || item.reads.some((read) => read.userId === userId)) return item;
            return {
              ...item,
              reads: [
                ...item.reads,
                {
                  userId,
                  readAt: new Date().toISOString(),
                  user: {
                    name: session.user?.name ?? "Bạn",
                    position: session.user?.position ?? null,
                    secondaryPosition: session.user?.secondaryPosition ?? null,
                    currentPosition: session.user?.currentPosition ?? null,
                    avatarUrl: null,
                  },
                },
              ],
            };
          }),
        });
      }
      return { previous };
    },
    onError: (_error, _announcementId, context) => {
      if (context?.previous) qc.setQueryData(["announcements"], context.previous);
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
