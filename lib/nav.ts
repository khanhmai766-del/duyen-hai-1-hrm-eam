import {
  LayoutDashboard,
  Bell,
  CalendarDays,
  Settings,
  Cpu,
  Wrench,
  Package,
  Repeat,
  ShieldAlert,
  BarChart3,
  Users,
  ShieldCheck,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /** Extra search terms (accent-free) to improve topbar search matching. */
  keywords?: string;
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Quản lý người dùng",
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard, keywords: "tong quan dashboard bang dieu khien" },
      { label: "Mệnh lệnh sản xuất", href: "/notifications", icon: Bell, keywords: "menh lenh san xuat production order thong bao notification bang tin canh bao" },
      { label: "Lịch làm việc", href: "/hr", icon: CalendarDays, keywords: "ca truc shift roster diem danh org chart so do" },
      {
        label: "Quản trị",
        href: "/admin/users",
        icon: Settings,
        adminOnly: true,
        keywords: "admin nguoi dung phan quyen role user",
        children: [
          { label: "Người dùng", href: "/admin/users", icon: Users, keywords: "nguoi dung user account quan ly" },
          { label: "Phân quyền", href: "/admin/roles", icon: ShieldCheck, keywords: "phan quyen role rbac" },
        ],
      },
    ],
  },
  {
    title: "Quản lý thiết bị",
    items: [
      { label: "Thông tin thiết bị", href: "/devices", icon: Cpu, keywords: "device thiet bi may moc esp fgd boiler turbine" },
      { label: "Lịch sử sửa chữa", href: "/repair-history", icon: Wrench, keywords: "repair sua chua bao tri history khiem khuyet" },
      { label: "Danh mục vật tư", href: "/materials", icon: Package, keywords: "material vat tu phu tung ton kho" },
      { label: "Lịch thay thế vật tư", href: "/replacements", icon: Repeat, keywords: "lich thay the vat tu replacement schedule canh bao dinh ky dau boi tron loc" },
      { label: "Khiếm khuyết thiết bị", href: "/defects", icon: ShieldAlert, keywords: "defect su co fault khiem khuyet" },
      { label: "Dashboard", href: "/reports", icon: BarChart3, keywords: "report bao cao thong ke analytics" },
    ],
  },
];

/** Strip Vietnamese diacritics for accent-insensitive search. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
