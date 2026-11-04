import { PERMISSION_LABELS, PERMISSIONS } from "./lib/auth/session";
const view = { ADMIN:"full", MANAGER:"read", SUPERVISOR:"read", TECHNICIAN:"read", VIEWER:"read" } as const;
const edit = { ADMIN:"full", MANAGER:"personal", SUPERVISOR:"personal", TECHNICIAN:"personal", VIEWER:"none" } as const;
const admin = { ADMIN:"full", MANAGER:"none", SUPERVISOR:"none", TECHNICIAN:"none", VIEWER:"none" } as const;
export const CTKTKT_PERMISSION_ROWS = [
  {id:"ctktkt-access",group:"Chỉ tiêu KTKT",feature:"Xem số liệu và báo cáo KTKT",note:"Mở phân hệ Chỉ tiêu KTKT trong Tiện ích.",matrix:view},
  ...PERMISSIONS.filter(p=>p!=="view_all").map(permission=>({id:`ctktkt:${permission}`,group:"Chỉ tiêu KTKT",feature:permission==="manage_users"?"Quản trị toàn bộ phân hệ KTKT":PERMISSION_LABELS[permission],
    note:permission==="manage_users"?"Toàn quyền số liệu, sao lưu, khôi phục và cấu hình KTKT. Tài khoản được quản lý tại mục Quản trị của web.":"Cá nhân: đúng phạm vi cương vị đang làm việc. Quản lý/Toàn quyền: cấp trực tiếp chức năng này. Chỉ đọc/Không: không cho nhập.",matrix:permission==="manage_users"?admin:edit})),
];
export const CTKTKT_DEFAULT_MATRIX=Object.fromEntries(CTKTKT_PERMISSION_ROWS.map(row=>[row.id,row.matrix]));
