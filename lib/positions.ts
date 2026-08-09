import { blockForPosition, isSelectableManagingPosition } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { ORG_CHIEF, ORG_LEADS, ORG_SEAT_TITLES } from "@/lib/org-template";
import {
  POSITION_CATALOG,
  type PositionCode,
  positionCodeOf,
  positionLabelOf,
  positionsMatch,
} from "@/lib/position-catalog";

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

export const OPERATION_POSITION_TITLES = POSITION_CATALOG.map((item) => item.label);

/**
 * Mã ổn định dùng cho nghiệp vụ mệnh lệnh. Tên tiếng Việt chỉ là nhãn hiển thị
 * và có thể thay đổi/viết theo nhiều biến thể mà không làm sai đối tượng nhận.
 */
export const ANNOUNCEMENT_POSITION_CODES = Object.fromEntries(
  POSITION_CATALOG.map((item) => [item.label, item.code])
) as Record<string, PositionCode>;

export type AnnouncementPositionCode = PositionCode;

export function announcementPositionLabel(position?: string | null) {
  return positionLabelOf(position);
}

/** So khớp cương vị nghiệp vụ, chấp nhận các bí danh và hậu tố tổ máy S1/S2. */
export function announcementPositionsMatch(
  left?: string | null,
  right?: string | null
) {
  return positionsMatch(left, right);
}

/**
 * Quan hệ xem giữa hai cương vị theo sơ đồ ca trực. Là luật phân cấp gốc dùng cho
 * TOÀN BỘ phiếu khiếm khuyết (đã gắn hay chưa gắn thiết bị) — gọi qua
 * `lib/defect-position-view.ts`, đừng gọi thẳng ở route để hai nơi không lệch luật:
 * - cương vị trực tiếp thấy phiếu của chính mình;
 * - Trưởng ca thấy toàn bộ;
 * - Trưởng kíp thấy các cương vị nằm dưới nhánh mình;
 * - Lò trưởng/Máy trưởng thấy toàn bộ cương vị trong khối mình quản lý.
 */
export function canViewUnmappedDefectPosition(
  sourcePosition?: string | null,
  viewerPosition?: string | null
) {
  if (announcementPositionsMatch(sourcePosition, viewerPosition)) return true;
  if (!sourcePosition || !viewerPosition) return false;

  if (announcementPositionsMatch(viewerPosition, ORG_CHIEF)) return true;

  const lead = ORG_LEADS.find((item) => announcementPositionsMatch(viewerPosition, item.title));
  if (lead) {
    return lead.columns
      .flat()
      .some((managedPosition) => announcementPositionsMatch(sourcePosition, managedPosition));
  }

  const viewerLabel = normalizeText(announcementPositionLabel(viewerPosition));
  const sourceBlock = blockForPosition(announcementPositionLabel(sourcePosition));
  if (viewerLabel === normalizeText("Lò Trưởng")) return sourceBlock === "Khối Lò Hơi";
  if (viewerLabel === normalizeText("Máy trưởng")) return sourceBlock === "Khối Turbine";

  return false;
}

export function announcementPositionCode(position?: string | null): AnnouncementPositionCode | null {
  return positionCodeOf(position);
}

export function announcementPositionLabelFromCode(code?: string | null) {
  const label = positionLabelOf(code);
  return positionCodeOf(code) ? label : null;
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
