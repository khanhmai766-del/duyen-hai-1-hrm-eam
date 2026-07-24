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
  "Khí Nén - Nhà Dầu",
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

/**
 * Mã ổn định dùng cho nghiệp vụ mệnh lệnh. Tên tiếng Việt chỉ là nhãn hiển thị
 * và có thể thay đổi/viết theo nhiều biến thể mà không làm sai đối tượng nhận.
 */
export const ANNOUNCEMENT_POSITION_CODES = {
  ESP: "ESP",
  FGD: "FGD",
  "Khí Nén - Nhà Dầu": "AIR_COMPRESSOR_OIL_HOUSE",
  "Lò phó": "BOILER_DEPUTY",
  "Lò Trưởng": "BOILER_LEAD",
  "Máy nghiền": "COAL_MILL",
  "Máy phó": "TURBINE_DEPUTY",
  "Máy trưởng": "TURBINE_LEAD",
  "NH3 - Lò hơi phụ": "AUX_BOILER_NH3",
  "Thải xỉ": "ASH_HANDLING",
  "Thiết bị đo lường điều khiển": "INSTRUMENT_CONTROL",
  "TK Lò máy": "BOILER_TURBINE_SHIFT_LEAD",
  "Trạm bơm nước thô": "RAW_WATER_PUMP",
  "Trạm bơm tuần hoàn": "CIRCULATING_WATER_PUMP",
  "Trợ thủ": "TURBINE_ASSISTANT",
  "Trực chính Điện": "ELECTRICAL_MAIN_OPERATOR",
  "Trực phụ điện": "ELECTRICAL_ASSISTANT_OPERATOR",
  "Trưởng ca": "SHIFT_SUPERVISOR",
  "Trưởng kíp điện": "ELECTRICAL_SHIFT_LEAD",
  "XLN hỗn hợp": "MIXED_WATER_TREATMENT",
  XLNT: "WASTEWATER_TREATMENT",
} as const satisfies Record<(typeof OPERATION_POSITION_TITLES)[number], string>;

export type AnnouncementPositionCode = (typeof ANNOUNCEMENT_POSITION_CODES)[keyof typeof ANNOUNCEMENT_POSITION_CODES];

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
      "VHV C&I",
      "VHV Thiết bị đo lường điều khiển",
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
    aliases: [
      "XLNT - Nhà dầu 5000m3",
      "XLNT",
      "VHV XLNT-ND5.",
      "VHV XLNT-ND5",
      "VHV XLN thải - Nhà dầu 5000m3",
      "VHV XLN thải – Nhà dầu 5000m3",
    ],
  },
  {
    canonical: "XLN hỗn hợp",
    aliases: ["XLN hỗn hợp", "XLNHH", "VHV XLNHH", "VHV XLN hỗn hợp"],
  },
  {
    canonical: "Trạm bơm tuần hoàn",
    aliases: ["Trạm bơm tuần hoàn", "TBTH", "VHV TBTH"],
  },
  {
    // Các biến thể Nhà dầu/Khí nén đều quy về tên chức vụ trên server chính.
    canonical: "Khí Nén - Nhà Dầu",
    aliases: [
      "Khí Nén - Nhà Dầu",
      "Khí nén - nhà dầu 300m3",
      "Khí nén - Nhà Dầu",
      "Khí Nén-Nhà Dầu",
      "Khí Nén – Nhà Dầu",
      "Nhà dầu - khí nén",
      "Nhà dầu - Khí nén",
      "Nhà Dầu - Khí Nén",
      "Nhà Dầu – Khí Nén",
      "VHV MNK-ND3.",
      "VHV MNK-ND3",
      "VHV Trạm khí nén – Nhà dầu HFO 300m3",
    ],
  },
  {
    // Một số danh mục cũ gọi "Trạm nước thô" là "Trạm bơm nước thô".
    canonical: "Trạm bơm nước thô",
    aliases: ["Trạm nước thô", "Trạm bơm nước thô", "VHV Trạm bơm nước thô"],
  },
  {
    canonical: "NH3 - Lò hơi phụ",
    aliases: [
      "NH3 - Lò hơi phụ",
      "NH3- Lò hơi phụ",
      "NH3 - Lò phụ",
      "NH3- Lò phụ",
      "VHV NH3-LHP",
      "VHV Trạm NH3 - Lò hơi phụ",
    ],
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
  return normalizeText(position)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function announcementPositionLabel(position?: string | null) {
  const clean = (position ?? "").trim().replace(/\s+S[12]$/i, "");
  const key = announcementPositionKey(clean);
  const group = ANNOUNCEMENT_POSITION_ALIASES.find((item) =>
    item.aliases.some((alias) => announcementPositionKey(alias) === key)
  );
  return group?.canonical ?? clean;
}

export function announcementPositionCode(position?: string | null): AnnouncementPositionCode | null {
  const label = announcementPositionLabel(position);
  const entry = Object.entries(ANNOUNCEMENT_POSITION_CODES).find(
    ([canonical]) => normalizeText(canonical) === normalizeText(label)
  );
  return (entry?.[1] as AnnouncementPositionCode | undefined) ?? null;
}

export function announcementPositionLabelFromCode(code?: string | null) {
  if (!code) return null;
  const entry = Object.entries(ANNOUNCEMENT_POSITION_CODES).find(([, value]) => value === code);
  return entry?.[0] ?? null;
}

export function announcementPositionOptions(userPositions: Array<string | null | undefined> = []) {
  return uniqueVietnamesePositions(standardPositionOptions(userPositions).map(announcementPositionLabel))
    .sort((a, b) => a.localeCompare(b, "vi"));
}

export function announcementShiftRosterPositionOptions() {
  return [...OPERATION_POSITION_TITLES];
}

export function isAnnouncementShiftRosterPosition(position?: string | null) {
  return announcementPositionCode(position) !== null;
}

export function selectableManagingPositionOptions(userPositions: Array<string | null | undefined> = []) {
  return standardPositionOptions(userPositions).filter(isSelectableManagingPosition);
}
