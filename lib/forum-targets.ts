import { normalizeText } from "@/lib/nav";
import { announcementPositionLabel, uniqueVietnamesePositions } from "@/lib/positions";
import { ALL_ANNOUNCEMENT_POSITIONS } from "@/lib/announcement-targets";

export function normalizeForumTargetPositions(value: unknown, max = 12) {
  const raw = Array.isArray(value)
    ? value
      : typeof value === "string"
        ? value.split(/[,\n]/)
        : [];

  if (raw.some((item) => String(item).trim() === ALL_ANNOUNCEMENT_POSITIONS)) {
    return [ALL_ANNOUNCEMENT_POSITIONS];
  }

  return uniqueVietnamesePositions(
    raw
      .map((item) => announcementPositionLabel(String(item)))
      .map((item) => item.trim())
      .filter(Boolean)
  ).slice(0, max);
}

export function forumPostTargetsPosition(targetPositions: string[] | null | undefined, position?: string | null) {
  const targets = targetPositions ?? [];
  if (!targets.length || !position?.trim()) return false;
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return true;
  const current = normalizeText(announcementPositionLabel(position));
  return targets.some((target) => normalizeText(announcementPositionLabel(target)) === current);
}

export function forumTargetPositionsLabel(targetPositions: string[] | null | undefined) {
  const targets = targetPositions ?? [];
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return "Tất cả cương vị";
  if (targets.length === 0) return "Chưa chọn cương vị";
  return uniqueVietnamesePositions(targets.map(announcementPositionLabel)).join(", ");
}
