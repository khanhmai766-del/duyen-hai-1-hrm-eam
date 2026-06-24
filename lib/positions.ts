import { isSelectableManagingPosition } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { ORG_SEAT_TITLES } from "@/lib/org-template";

export function uniqueVietnamesePositions(positions: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of positions) {
    const position = raw?.trim();
    if (!position) continue;
    const key = normalizeText(position);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(position);
  }
  return result;
}

export function standardPositionOptions(userPositions: Array<string | null | undefined> = []) {
  return uniqueVietnamesePositions([...ORG_SEAT_TITLES, ...userPositions]).sort((a, b) => a.localeCompare(b, "vi"));
}

export function announcementPositionLabel(position?: string | null) {
  return (position ?? "").trim().replace(/\s+S[12]$/i, "");
}

export function announcementPositionOptions(userPositions: Array<string | null | undefined> = []) {
  return uniqueVietnamesePositions(standardPositionOptions(userPositions).map(announcementPositionLabel))
    .sort((a, b) => a.localeCompare(b, "vi"));
}

export function announcementShiftRosterPositionOptions() {
  return uniqueVietnamesePositions(ORG_SEAT_TITLES.map(announcementPositionLabel))
    .sort((a, b) => a.localeCompare(b, "vi"));
}

export function isAnnouncementShiftRosterPosition(position?: string | null) {
  const current = normalizeText(announcementPositionLabel(position));
  if (!current) return false;
  return announcementShiftRosterPositionOptions().some((item) => normalizeText(item) === current);
}

export function selectableManagingPositionOptions(userPositions: Array<string | null | undefined> = []) {
  return standardPositionOptions(userPositions).filter(isSelectableManagingPosition);
}
