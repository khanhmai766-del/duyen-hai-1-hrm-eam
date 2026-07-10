import { normalizeText } from "@/lib/nav";
import {
  announcementPositionCode,
  announcementPositionLabel,
  announcementPositionLabelFromCode,
  isAnnouncementShiftRosterPosition,
  uniqueVietnamesePositions,
} from "@/lib/positions";

export const ALL_ANNOUNCEMENT_POSITIONS = "__ALL_POSITIONS__";

interface TargetPayload {
  targetPositions?: string[];
  targetPositionCodes?: string[];
}

export function encodeAnnouncementTargets(targetPositions: string[]) {
  const clean = uniqueVietnamesePositions(targetPositions.map(announcementPositionLabel));
  const targetPositionCodes = clean.includes(ALL_ANNOUNCEMENT_POSITIONS)
    ? [ALL_ANNOUNCEMENT_POSITIONS]
    : clean.map(announcementPositionCode).filter((code): code is NonNullable<typeof code> => Boolean(code));
  // Giữ cả nhãn để bản triển khai cũ vẫn đọc được, mã chuẩn là nguồn so khớp chính.
  return JSON.stringify({ targetPositions: clean, targetPositionCodes });
}

export function parseAnnouncementTargets(value?: string | null): string[] {
  if (!value) return [ALL_ANNOUNCEMENT_POSITIONS];
  try {
    const parsed = JSON.parse(value) as TargetPayload;
    const labels = Array.isArray(parsed.targetPositions)
      ? parsed.targetPositions.map((p) => String(p).trim()).filter(Boolean)
      : [];
    const labelsFromCodes = Array.isArray(parsed.targetPositionCodes)
      ? parsed.targetPositionCodes
          .map((code) => code === ALL_ANNOUNCEMENT_POSITIONS ? ALL_ANNOUNCEMENT_POSITIONS : announcementPositionLabelFromCode(String(code)))
          .filter((label): label is string => Boolean(label))
      : [];
    const targets = uniqueVietnamesePositions([...labels, ...labelsFromCodes]);
    if (!targets.length && !Array.isArray(parsed.targetPositions) && !Array.isArray(parsed.targetPositionCodes)) {
      return [ALL_ANNOUNCEMENT_POSITIONS];
    }
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
  const currentCode = announcementPositionCode(position);
  if (!currentCode) return false;
  // Dữ liệu mới và cũ đều được quy về mã trước khi so sánh.
  if (targets.some((target) => announcementPositionCode(target) === currentCode)) return true;
  // Tương thích dữ liệu lạ chưa có trong danh mục mã, không làm rộng đối tượng nhận.
  const current = normalizeText(announcementPositionLabel(position));
  return targets.some((target) => normalizeText(announcementPositionLabel(target)) === current);
}

export function announcementTargetLabel(value?: string | null) {
  const targets = parseAnnouncementTargets(value);
  if (targets.includes(ALL_ANNOUNCEMENT_POSITIONS)) return "Tất cả cương vị";
  if (targets.length === 0) return "Chưa chọn cương vị";
  return uniqueVietnamesePositions(targets.map(announcementPositionLabel)).join(", ");
}
