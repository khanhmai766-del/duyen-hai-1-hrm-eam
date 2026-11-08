/** RBAC chung chỉ điều khiển quyền mở phân hệ. Nghiệp vụ dùng bảng cương vị riêng. */
export const CTKTKT_PERMISSION_ROWS = [{
  id: "ctktkt-access", group: "Chỉ tiêu KTKT", feature: "Mở và xem phân hệ KTKT",
  note: "Quyền nhập liệu, đồng bộ và quản trị được chọn qua nút “Phân quyền KTKT” ở đầu trang này. Các mức Chỉ xem/Cá nhân/Quản lý/Toàn quyền ở đây đều chỉ cho mở phân hệ.",
  matrix: { ADMIN: "full", MANAGER: "read", SUPERVISOR: "read", TECHNICIAN: "read", VIEWER: "read" } as const,
}, {
  id: "ctktkt-delegate", group: "Chỉ tiêu KTKT", feature: "Phân công nhập liệu KTKT",
  note: "Hiện mục “Phân công nhập liệu” trong menu Chỉ tiêu KTKT: người được cấp (mức bất kỳ khác Không) giao/thu hồi quyền nhập liệu KTKT cho các cương vị vận hành viên. Không giao được quyền quản trị hay quyền của lãnh đạo. Cấp theo từng người ở phần “Thêm phân quyền”.",
  matrix: { ADMIN: "full", MANAGER: "none", SUPERVISOR: "none", TECHNICIAN: "none", VIEWER: "none" } as const,
}];
export const CTKTKT_DEFAULT_MATRIX = Object.fromEntries(CTKTKT_PERMISSION_ROWS.map(row => [row.id, row.matrix]));
