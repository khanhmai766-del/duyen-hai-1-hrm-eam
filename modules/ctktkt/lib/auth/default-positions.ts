import { PERMISSIONS, type Permission, type Role } from "./session";
type PositionSeed = {position:string;category:string;role:Role;permissions:Permission[];description:string};
export const DEFAULT_POSITIONS: PositionSeed[] = [
  // Khối Lãnh đạo & Kỹ thuật
  {
    position: "Quản đốc",
    category: "Lãnh đạo",
    role: "admin",
    permissions: [...PERMISSIONS],
    description: "Toàn quyền quản trị hệ thống, phân quyền và phê duyệt",
  },
  {
    position: "Phó Quản đốc",
    category: "Lãnh đạo",
    role: "admin",
    permissions: [...PERMISSIONS],
    description: "Toàn quyền quản trị hệ thống, xem và điều hành số liệu",
  },
  {
    position: "Kỹ thuật viên",
    category: "Kỹ thuật",
    role: "technician",
    permissions: [
      "view_all",
      "edit_monthly_kpi",
      "edit_daily_inputs",
      "edit_ppa",
      "edit_pmis",
      "edit_water",
      "sync_qlkt",
      "sync_google_sheet",
    ],
    description: "Quản lý chỉ tiêu KTKT, nhập số liệu ngày, SHN PPA và báo cáo PMIS",
  },
  {
    position: "Thống kê",
    category: "Kỹ thuật",
    role: "editor",
    permissions: [
      "view_all",
      "edit_monthly_kpi",
      "edit_daily_inputs",
      "edit_water",
      "sync_qlkt",
    ],
    description: "Thống kê chỉ tiêu và số liệu sản xuất",
  },

  // Khối Giám sát & Điều hành ca
  {
    position: "Trưởng ca",
    category: "Vận hành ca",
    role: "supervisor",
    permissions: [
      "view_all",
      "edit_bcsx",
      "edit_daily_inputs",
      "edit_water",
      "sync_qlkt",
    ],
    description: "Giám sát vận hành ca, nhập 48 điểm nửa giờ và xuất báo cáo BCSX",
  },
  {
    position: "TK Lò máy",
    category: "Vận hành ca",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trưởng kíp Lò - Máy",
  },
  {
    position: "Trưởng kíp điện",
    category: "Vận hành ca",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trưởng kíp Điện",
  },

  // Khối Lò - Máy
  {
    position: "Lò trưởng",
    category: "Khối Lò",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trưởng kíp Lò hơi",
  },
  {
    position: "Lò phó",
    category: "Khối Lò",
    role: "viewer",
    permissions: ["view_all"],
    description: "Phó kíp Lò hơi",
  },
  {
    position: "Máy trưởng",
    category: "Khối Máy",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trưởng kíp Tua bin - Máy phát",
  },
  {
    position: "Máy phó",
    category: "Khối Máy",
    role: "viewer",
    permissions: ["view_all"],
    description: "Phó kíp Tua bin",
  },
  {
    position: "Máy nghiền",
    category: "Khối Lò",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành hệ thống máy nghiền than",
  },

  // Khối Điện & Đo lường
  {
    position: "Trực chính Điện",
    category: "Khối Điện",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trực chính hệ thống điện nhà máy",
  },
  {
    position: "Trực phụ điện",
    category: "Khối Điện",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trực phụ hệ thống điện nhà máy",
  },
  {
    position: "Thiết bị đo lường điều khiển",
    category: "Đo lường",
    role: "viewer",
    permissions: ["view_all"],
    description: "Theo dõi hệ thống đo lường & điều khiển",
  },

  // Khối Môi trường & Hóa học
  {
    position: "FGD",
    category: "Môi trường",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành hệ thống khử lưu huỳnh FGD",
  },
  {
    position: "ESP",
    category: "Môi trường",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành hệ thống lọc bụi tĩnh điện ESP",
  },
  {
    position: "NH3 - Lò hơi phụ",
    category: "Môi trường",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành hệ thống NH3 khử NOx & Lò hơi phụ",
  },
  {
    position: "XLN hỗn hợp",
    category: "Hóa nước",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành trạm xử lý nước hỗn hợp",
  },
  {
    position: "XLNT",
    category: "Hóa nước",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành trạm xử lý nước thải",
  },

  // Khối Phụ trợ & Nhiên liệu
  {
    position: "Khí Nén – Nhà Dầu",
    category: "Phụ trợ",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành trạm khí nén và nhà dầu",
  },
  {
    position: "Thải xỉ",
    category: "Phụ trợ",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành hệ thống thải xỉ xỉ đáy lò",
  },
  {
    position: "Trạm bơm nước thô",
    category: "Phụ trợ",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành trạm bơm nước thô cấp nước nhà máy",
  },
  {
    position: "Trạm bơm tuần hoàn",
    category: "Phụ trợ",
    role: "viewer",
    permissions: ["view_all"],
    description: "Vận hành trạm bơm nước làm mát tuần hoàn",
  },
  {
    position: "Trợ thủ",
    category: "Phụ trợ",
    role: "viewer",
    permissions: ["view_all"],
    description: "Trợ thủ vận hành thiết bị phụ trợ",
  },
];
