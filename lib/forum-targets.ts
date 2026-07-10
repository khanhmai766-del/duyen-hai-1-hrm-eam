import {
  announcementPositionCode,
  announcementPositionLabel,
  announcementPositionLabelFromCode,
  uniqueVietnamesePositions,
} from "@/lib/positions";
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

  return Array.from(new Set(
    raw
      .map((item) => String(item).trim())
      .map((item) => announcementPositionLabelFromCode(item) ?? item)
      .map(announcementPositionCode)
      .filter((code): code is NonNullable<typeof code> => Boolean(code))
  )).slice(0, max);
}

export function forumPostTargetsPosition(targetPositions: string[] | null | undefined, position?: string | null) {
  const targets = targetPositions ?? [];
  if (!targets.length || !position?.trim()) return false;
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return true;
  const currentCode = announcementPositionCode(position);
  if (!currentCode) return false;
  return targets.some((target) => {
    const label = announcementPositionLabelFromCode(target) ?? target;
    return announcementPositionCode(label) === currentCode;
  });
}

export function forumTargetPositionLabels(targetPositions: string[] | null | undefined) {
  const targets = targetPositions ?? [];
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return [ALL_ANNOUNCEMENT_POSITIONS];
  return uniqueVietnamesePositions(
    targets
      .map((target) => announcementPositionLabelFromCode(target) ?? announcementPositionLabel(target))
      .filter(Boolean)
  );
}

export function forumTargetPositionsLabel(targetPositions: string[] | null | undefined) {
  const targets = targetPositions ?? [];
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return "Tất cả cương vị";
  if (targets.length === 0) return "Chưa chọn cương vị";
  return forumTargetPositionLabels(targets).join(", ");
}
