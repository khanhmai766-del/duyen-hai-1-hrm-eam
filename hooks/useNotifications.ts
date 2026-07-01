"use client";

import { Megaphone, type LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { isAnnouncementReadExemptPosition } from "@/lib/announcement-read";
import { announcementTargetLabel, isAnnouncementTargetForPosition } from "@/lib/announcement-targets";

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
  const { position: myPosition } = useCurrentPosition();
  const exemptFromReadConfirm = isAnnouncementReadExemptPosition(myPosition);
  const announcements = useAnnouncements();

  const loading = announcements.isLoading;

  const notices: Notice[] = exemptFromReadConfirm ? [] : (announcements.data?.data ?? [])
    .filter((a) => isAnnouncementTargetForPosition(a.classification, myPosition))
    .filter((a) => !myId || !a.reads.some((r) => r.userId === myId))
    .slice()
    .sort((x, y) => {
      const xDate = x.invalidatedAt ?? x.createdAt;
      const yDate = y.invalidatedAt ?? y.createdAt;
      return Number(y.pinned) - Number(x.pinned) || +new Date(yDate) - +new Date(xDate);
    })
    .map((a) => {
      const invalidated = Boolean(a.invalidatedAt);
      return {
        id: "ann-" + a.id,
        icon: Megaphone,
        tone: invalidated ? "red" : a.pinned ? "amber" : "blue",
        title: `${invalidated ? "Mệnh lệnh hết hiệu lực" : "Mệnh lệnh sản xuất"}: ${a.title}`,
        desc: [
          announcementTargetLabel(a.classification),
          invalidated ? "Không còn hiệu lực" : a.orderedBy ? `Theo lệnh: ${a.orderedBy}` : a.body,
        ].filter(Boolean).join(" · ").slice(0, 80),
        href: "/notifications",
        date: a.invalidatedAt ?? a.createdAt,
      };
    });

  return { notices, loading };
}

export const NOTICE_TONE = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-accent",
} as const;
