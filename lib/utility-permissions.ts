/** Quyền mở các trang trong nhóm menu TIỆN ÍCH. Mặc định mọi vai trò được xem (như trước khi có quyền này);
 *  Quản trị viên tắt dần ở /admin/roles. Mức bất kỳ khác "Không" đều chỉ có nghĩa là được mở trang. */
export const UTILITY_PERMISSION_ROWS = [{
  id: "utility-overhaul-view", group: "Tiện ích", feature: "Xem Tiến độ đại tu",
  note: "Hiện mục “Tiến độ đại tu” trong menu và cho mở trang /tien-ich/tien-do-dai-tu. " +
    "Không ảnh hưởng phần tiến độ hạng mục trong Phiếu công tác. Mức bất kỳ khác Không đều chỉ cho xem.",
  matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" } as const,
}, {
  id: "utility-oil-analysis-view", group: "Tiện ích", feature: "Xem Kết quả phân tích dầu",
  note: "Hiện mục “Kết quả phân tích dầu” trong menu, cho mở trang và đọc danh sách mẫu Không Đạt. " +
    "Nút đồng bộ từ LIMS vẫn theo quyền “Đồng bộ kết quả phân tích dầu từ LIMS”.",
  matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" } as const,
}, {
  id: "utility-chuan-the-thuc-view", group: "Tiện ích", feature: "Dùng Chuẩn thể thức văn bản",
  note: "Hiện mục “Chuẩn thể thức văn bản” trong menu, cho mở trang và dùng rà soát AI bằng khoá Gemini chung của máy chủ. " +
    "Mức bất kỳ khác Không đều cho dùng đầy đủ.",
  matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" } as const,
}];

export const UTILITY_DEFAULT_MATRIX = Object.fromEntries(UTILITY_PERMISSION_ROWS.map(row => [row.id, row.matrix]));
export const UTILITY_VIEW_LEVELS = ["read", "personal", "manage", "full"] as const;
