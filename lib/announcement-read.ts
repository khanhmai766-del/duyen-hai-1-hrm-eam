import { isSelectableManagingPosition } from "@/lib/constants";
import { isAnnouncementTargetForPosition } from "@/lib/announcement-targets";
import { isAnnouncementShiftRosterPosition } from "@/lib/positions";

/**
 * Cương vị cấp quản lý/hành chính (Quản đốc, Phó quản đốc, Kỹ thuật viên không
 * thuộc danh mục vận hành, Thống kê)
 * được MIỄN xác nhận đọc mệnh lệnh: không tạo bản ghi "đã đọc", không tính vào tổng
 * số phải đọc, và không nhận thông báo nhắc đọc.
 *
 * Dùng chung quy tắc với {@link isSelectableManagingPosition} (nguồn EXCLUDED_MANAGING_POSITION_KEYS
 * trong lib/constants) để tránh lệch danh sách. Cương vị rỗng KHÔNG được miễn — vẫn phải xác nhận đọc.
 */
export function isAnnouncementReadExemptPosition(position?: string | null) {
  // Ưu tiên danh mục cương vị vận hành đã chuẩn hóa. Ví dụ "Kỹ thuật viên I&C"
  // là alias của "Thiết bị đo lường điều khiển", không phải nhân sự được miễn đọc.
  if (isAnnouncementShiftRosterPosition(position)) return false;
  return !!position && !isSelectableManagingPosition(position);
}

/** Nguồn duy nhất quyết định một cương vị có phải xác nhận một mệnh lệnh. */
export function mustConfirmAnnouncementRead(
  classification: string | null | undefined,
  position?: string | null
) {
  return !isAnnouncementReadExemptPosition(position) && isAnnouncementTargetForPosition(classification, position);
}
