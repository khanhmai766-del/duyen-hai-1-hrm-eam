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

const ANNOUNCEMENT_POSITION_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: "I&C",
    aliases: [
      "I&C",
      "I & C",
      "Thiết bị đo lường điều khiển",
      "Thiết bị đo lường và điều khiển",
      "Thiết bị đo lường & điều khiển",
    ],
  },
  {
    // Các biến thể chức vụ user đều quy về cương vị trong mệnh lệnh.
    canonical: "Trưởng kíp Lò - Máy DH1",
    aliases: [
      "Trưởng kíp Lò - Máy DH1",
      "Trưởng kíp Lò - Máy",
      "Trưởng kíp Lò máy",
      "TK Lò máy",
    ],
  },
  {
    // "XLNT" ≡ "XLNT - Nhà dầu 5000m3"
    canonical: "XLNT - Nhà dầu 5000m3",
    aliases: ["XLNT - Nhà dầu 5000m3", "XLNT"],
  },
  {
    // "Khí nén - Nhà dầu" ≡ "Khí nén - nhà dầu 300m3" (normalizeText đã bỏ qua hoa/thường + dấu)
    canonical: "Khí nén - nhà dầu 300m3",
    aliases: ["Khí nén - nhà dầu 300m3", "Khí nén - Nhà Dầu"],
  },
];

function announcementPositionKey(position: string) {
  return normalizeText(position).replace(/\s+/g, " ");
}

export function announcementPositionLabel(position?: string | null) {
  const clean = (position ?? "").trim().replace(/\s+S[12]$/i, "");
  const key = announcementPositionKey(clean);
  const group = ANNOUNCEMENT_POSITION_ALIASES.find((item) =>
    item.aliases.some((alias) => announcementPositionKey(alias) === key)
  );
  return group?.canonical ?? clean;
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
