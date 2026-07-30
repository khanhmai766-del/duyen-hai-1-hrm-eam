import { positionSheetLabel } from "@/lib/position-catalog";

/** Tra nhãn Sheet cho một cương vị nội bộ theo tổ máy đang chọn. Trả về null nếu chưa có ánh xạ. */
export function defectSheetPositionLabel(position: string | null | undefined, unit: string | null | undefined): string | null {
  return positionSheetLabel(position, unit);
}
