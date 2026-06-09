"use client";

import { Megaphone, type LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useAnnouncements } from "@/hooks/useAnnouncements";

export interface Notice {
  id: string;
  icon: LucideIcon;
  tone: "red" | "amber" | "blue";
  title: string;
  desc: string;
  href: string;
  date?: string;
}

/**
 * Builds the "Vận hành" alert feed for the topbar bell — CHỈ gồm Mệnh lệnh sản
 * xuất mà người dùng hiện tại CHƯA xác nhận đọc. Không đưa các cảnh báo thuộc
 * Quản lý thiết bị (thiết bị sự cố, lịch sử sửa chữa, vật tư tồn thấp...).
 */
export function useNotifications() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const announcements = useAnnouncements();

  const loading = announcements.isLoading;

  const notices: Notice[] = (announcements.data?.data ?? [])
    .filter((a) => !myId || !a.reads.some((r) => r.userId === myId))
    .slice()
    .sort((x, y) => Number(y.pinned) - Number(x.pinned) || +new Date(y.createdAt) - +new Date(x.createdAt))
    .map((a) => ({
      id: "ann-" + a.id,
      icon: Megaphone,
      tone: a.pinned ? "amber" : "blue",
      title: `Mệnh lệnh sản xuất: ${a.title}`,
      desc: [a.classification, a.orderedBy ? `Theo lệnh: ${a.orderedBy}` : a.body].filter(Boolean).join(" · ").slice(0, 80),
      href: "/notifications",
      date: a.createdAt,
    }));

  return { notices, loading };
}

export const NOTICE_TONE = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-accent",
} as const;
