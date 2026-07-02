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

export const OPERATION_POSITION_TITLES = [
  "ESP",
  "FGD",
  "Khí nén - Nhà dầu",
  "Lò phó",
  "Lò Trưởng",
  "Máy nghiền",
  "Máy phó",
  "Máy trưởng",
  "NH3 - Lò hơi phụ",
  "Thải xỉ",
  "Thiết bị đo lường điều khiển",
  "TK Lò máy",
  "Trạm bơm nước thô",
  "Trạm bơm tuần hoàn",
  "Trợ thủ",
  "Trực chính Điện",
  "Trực phụ điện",
  "Trưởng ca",
  "Trưởng kíp điện",
  "XLN hỗn hợp",
  "XLNT",
] as const;

const ANNOUNCEMENT_POSITION_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: "Thiết bị đo lường điều khiển",
    aliases: [
      "I&C",
      "I & C",
      "Kỹ thuật viên I&C",
      "KTV I&C",
      "Thiết bị đo lường điều khiển",
      "Thiết bị đo lường và điều khiển",
      "Thiết bị đo lường & điều khiển",
    ],
  },
  {
    // Các biến thể chức vụ user đều quy về cương vị trong mệnh lệnh.
    canonical: "TK Lò máy",
    aliases: [
      "Trưởng kíp Lò - Máy DH1",
      "Trưởng kíp Lò - Máy",
      "Trưởng kíp Lò máy",
      "TK Lò máy",
    ],
  },
  {
    // "XLNT" ≡ "XLNT - Nhà dầu 5000m3"
    canonical: "XLNT",
    aliases: ["XLNT - Nhà dầu 5000m3", "XLNT"],
  },
  {
    // "Khí nén - Nhà dầu" ≡ "Khí nén - nhà dầu 300m3" (normalizeText đã bỏ qua hoa/thường + dấu)
    canonical: "Khí nén - Nhà dầu",
    aliases: ["Khí nén - nhà dầu 300m3", "Khí nén - Nhà Dầu", "Nhà dầu - khí nén", "Nhà dầu - Khí nén"],
  },
  {
    // Một số danh mục cũ gọi "Trạm nước thô" là "Trạm bơm nước thô".
    canonical: "Trạm bơm nước thô",
    aliases: ["Trạm nước thô", "Trạm bơm nước thô"],
  },
  {
    canonical: "NH3 - Lò hơi phụ",
    aliases: ["NH3 - Lò hơi phụ", "NH3- Lò hơi phụ", "NH3 - Lò phụ", "NH3- Lò phụ"],
  },
  {
    canonical: "Lò Trưởng",
    aliases: ["Lò Trưởng", "Lò trưởng"],
  },
  {
    canonical: "Lò phó",
    aliases: ["Lò phó", "Lò Phó"],
  },
  {
    canonical: "Trực chính Điện",
    aliases: ["Trực chính Điện", "Trực chính điện"],
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
  return [...OPERATION_POSITION_TITLES];
}

export function isAnnouncementShiftRosterPosition(position?: string | null) {
  const current = normalizeText(announcementPositionLabel(position));
  if (!current) return false;
  return announcementShiftRosterPositionOptions().some((item) => normalizeText(item) === current);
}

export function selectableManagingPositionOptions(userPositions: Array<string | null | undefined> = []) {
  return standardPositionOptions(userPositions).filter(isSelectableManagingPosition);
}
