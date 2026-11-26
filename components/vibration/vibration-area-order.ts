/**
 * Thứ tự cương vị của ô "Cương vị" ở màn Theo kỳ, lấy từ `db.areas` của web độ rung cũ (đọc từ bản sao lưu).
 * Cương vị không có trong danh sách xếp sau, theo bảng chữ cái tiếng Việt.
 */
export const OLD_AREA_ORDER = [
  "Lò phó S1", "Lò phó S2", "Máy nghiền S1", "Máy nghiền S2", "Thải xỉ", "ESP S1", "ESP S2", "FGD S1", "FGD S2",
  "Trợ thủ S1", "Trợ thủ S2", "Máy phó S1", "Máy phó S2", "Trạm bơm tuần hoàn", "Khí nén - nhà dầu 300m3",
  "Trực chính điện", "Trực phụ điện", "XLN hỗn hợp", "XLNT - Nhà dầu 5000m3", "NH3 - Lò hơi phụ", "Trạm nước thô",
] as const;

export function compareAreas(a: string, b: string) {
  const ia = (OLD_AREA_ORDER as readonly string[]).indexOf(a);
  const ib = (OLD_AREA_ORDER as readonly string[]).indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  return a.localeCompare(b, "vi");
}
