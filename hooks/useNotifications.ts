"use client";

import * as React from "react";
import { Megaphone, MessageSquareText, type LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { useForumPosts } from "@/hooks/useForum";
import { isAnnouncementReadExemptPosition } from "@/lib/announcement-read";
import { announcementTargetLabel, isAnnouncementTargetForPosition } from "@/lib/announcement-targets";
import { forumPostTargetsPosition, forumTargetPositionsLabel } from "@/lib/forum-targets";

const FORUM_NOTICE_READ_KEY = "pp:forum-notices-read";

function readAckedForumNotices() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FORUM_NOTICE_READ_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

export function acknowledgeForumNotice(postId: string) {
  if (typeof window === "undefined") return;
  const next = readAckedForumNotices();
  next.add(postId);
  window.localStorage.setItem(FORUM_NOTICE_READ_KEY, JSON.stringify(Array.from(next).slice(-200)));
  window.dispatchEvent(new Event("forum-notices-updated"));
}

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
 * Builds the "Vận hành" alert feed for the topbar bell: mệnh lệnh sản xuất
 * chưa xác nhận đọc và chủ đề Forum được gửi tới cương vị hiện tại.
 */
export function useNotifications() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const { position: myPosition } = useCurrentPosition();
  const exemptFromReadConfirm = isAnnouncementReadExemptPosition(myPosition);
  const announcements = useAnnouncements();
  const forumPosts = useForumPosts({ category: "ALL" });
  const [ackedForumIds, setAckedForumIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    const syncAcked = () => setAckedForumIds(readAckedForumNotices());
    syncAcked();
    window.addEventListener("forum-notices-updated", syncAcked);
    window.addEventListener("storage", syncAcked);
    return () => {
      window.removeEventListener("forum-notices-updated", syncAcked);
      window.removeEventListener("storage", syncAcked);
    };
  }, []);

  const loading = announcements.isLoading || forumPosts.isLoading;

  const announcementNotices: Notice[] = exemptFromReadConfirm ? [] : (announcements.data?.data ?? [])
    .filter((a) => !a.invalidatedAt)
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

  const forumPostNotices: Notice[] = (forumPosts.data?.data ?? [])
    .filter((post) => forumPostTargetsPosition(post.targetPositions, myPosition))
    .filter((post) => post.author.id !== myId)
    .filter((post) => !ackedForumIds.has(post.id))
    .slice()
    .sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))
    .slice(0, 10)
    .map((post) => ({
      id: "forum-" + post.id,
      icon: MessageSquareText,
      tone: "blue",
      title: `Forum kỹ thuật: ${post.title}`,
      desc: forumTargetPositionsLabel(post.targetPositions).slice(0, 80),
      href: "/forum",
      date: post.createdAt,
    }));

  const forumReplyNotices: Notice[] = (forumPosts.data?.data ?? [])
    .filter((post) => !!post.latestReply)
    .filter((post) => post.latestReply?.author.id !== myId)
    .filter((post) => {
      const matchesTargetPosition = forumPostTargetsPosition(post.targetPositions, myPosition);
      const participated = !!myId && (post.author.id === myId || post.replyAuthorIds.includes(myId));
      return matchesTargetPosition || participated;
    })
    .filter((post) => !ackedForumIds.has(`reply-${post.latestReply!.id}`))
    .slice()
    .sort((x, y) => +new Date(y.latestReply!.createdAt) - +new Date(x.latestReply!.createdAt))
    .slice(0, 10)
    .map((post) => ({
      id: "forum-reply-" + post.latestReply!.id,
      icon: MessageSquareText,
      tone: "blue",
      title: `Bình luận mới: ${post.title}`,
      desc: `${post.latestReply!.author.name}: ${post.latestReply!.content}`.slice(0, 80),
      href: "/forum",
      date: post.latestReply!.createdAt,
    }));

  const notices = [...announcementNotices, ...forumReplyNotices, ...forumPostNotices].sort((x, y) => {
    return +new Date(y.date ?? 0) - +new Date(x.date ?? 0);
  });

  return { notices, loading };
}

export const NOTICE_TONE = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-accent",
} as const;
