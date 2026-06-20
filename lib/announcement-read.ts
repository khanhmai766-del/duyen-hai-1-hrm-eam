import { isSelectableManagingPosition } from "@/lib/constants";

/**
 * Cương vị cấp quản lý/hành chính (Quản đốc, Phó quản đốc, Kỹ thuật viên, Thống kê)
 * được MIỄN xác nhận đọc mệnh lệnh: không tạo bản ghi "đã đọc", không tính vào tổng
 * số phải đọc, và không nhận thông báo nhắc đọc.
 *
 * Dùng chung quy tắc với {@link isSelectableManagingPosition} (nguồn EXCLUDED_MANAGING_POSITION_KEYS
 * trong lib/constants) để tránh lệch danh sách. Cương vị rỗng KHÔNG được miễn — vẫn phải xác nhận đọc.
 */
export function isAnnouncementReadExemptPosition(position?: string | null) {
  return !!position && !isSelectableManagingPosition(position);
}
