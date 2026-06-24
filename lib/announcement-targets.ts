import { normalizeText } from "@/lib/nav";
import {
  announcementPositionLabel,
  isAnnouncementShiftRosterPosition,
  uniqueVietnamesePositions,
} from "@/lib/positions";

export const ALL_ANNOUNCEMENT_POSITIONS = "__ALL_POSITIONS__";

interface TargetPayload {
  targetPositions?: string[];
}

export function encodeAnnouncementTargets(targetPositions: string[]) {
  const clean = uniqueVietnamesePositions(targetPositions.map(announcementPositionLabel));
  return JSON.stringify({ targetPositions: clean });
}

export function parseAnnouncementTargets(value?: string | null): string[] {
  if (!value) return [ALL_ANNOUNCEMENT_POSITIONS];
  try {
    const parsed = JSON.parse(value) as TargetPayload;
    if (!Array.isArray(parsed.targetPositions)) return [ALL_ANNOUNCEMENT_POSITIONS];
    const targets = parsed.targetPositions.map((p) => String(p).trim()).filter(Boolean);
    return targets;
  } catch {
    // Dữ liệu cũ từng lưu "Vận hành" / "An toàn vệ sinh lao động"; coi như áp dụng mọi cương vị.
    return [ALL_ANNOUNCEMENT_POSITIONS];
  }
}

export function targetsAllPositions(value?: string | null) {
  return parseAnnouncementTargets(value).includes(ALL_ANNOUNCEMENT_POSITIONS);
}

export function isAnnouncementTargetForPosition(value: string | null | undefined, position?: string | null) {
  const targets = parseAnnouncementTargets(value);
  if (!isAnnouncementShiftRosterPosition(position)) return false;
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return true;
  const current = normalizeText(announcementPositionLabel(position));
  return !!current && targets.some((target) => normalizeText(target) === current);
}

export function announcementTargetLabel(value?: string | null) {
  const targets = parseAnnouncementTargets(value);
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return "Tất cả cương vị";
  if (targets.length === 0) return "Chưa chọn cương vị";
  return uniqueVietnamesePositions(targets.map(announcementPositionLabel)).join(", ");
}
