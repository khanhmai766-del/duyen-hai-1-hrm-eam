import {
  LayoutDashboard,
  Megaphone,
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
  MessagesSquare,
  FileText,
  Archive,
  Workflow,
  BellRing,
  ClipboardList,
} from "lucide-react";
import { effectiveUserPosition, type PositionCarrier } from "@/lib/current-position";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  permissionIds?: string[];
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
      { label: "Mệnh lệnh sản xuất", href: "/notifications", icon: Megaphone, keywords: "menh lenh san xuat production order thong bao notification bang tin canh bao loa" },
      { label: "Lịch làm việc", href: "/hr", icon: CalendarDays, keywords: "ca truc shift roster diem danh org chart so do" },
      {
        label: "Quản trị",
        href: "/admin/users",
        icon: Settings,
        adminOnly: true,
        permissionIds: ["user-manage", "rbac-manage", "system_audit_log:view", "broadcast-manage"],
        keywords: "admin nguoi dung phan quyen role user",
        children: [
          { label: "Người dùng", href: "/admin/users", icon: Users, permissionIds: ["user-manage", "system_audit_log:view"], keywords: "nguoi dung user account quan ly" },
          { label: "Phân quyền", href: "/admin/roles", icon: ShieldCheck, permissionIds: ["rbac-manage"], keywords: "phan quyen role rbac" },
          { label: "Thông báo hệ thống", href: "/admin/broadcast", icon: BellRing, permissionIds: ["broadcast-manage"], keywords: "thong bao he thong broadcast message box gui thong bao popup" },
        ],
      },
    ],
  },
  {
    title: "Quản lý thiết bị",
    items: [
      { label: "Dashboard", href: "/reports", icon: BarChart3, keywords: "report bao cao thong ke analytics dashboard thiet bi" },
      { label: "Thông tin thiết bị", href: "/devices", icon: Cpu, keywords: "device thiet bi may moc esp fgd boiler turbine" },
      { label: "Khiếm khuyết thiết bị", href: "/defects", icon: ShieldAlert, keywords: "defect su co fault khiem khuyet" },
      { label: "Lịch sử sửa chữa", href: "/repair-history", icon: Wrench, keywords: "repair sua chua bao tri history khiem khuyet" },
    ],
  },
  {
    title: "QUẢN LÝ VẬT TƯ",
    items: [
      { label: "Danh mục vật tư", href: "/materials", icon: Package, keywords: "material vat tu phu tung ton kho" },
      { label: "Lịch thay thế vật tư", href: "/replacements", icon: Repeat, keywords: "lich thay the vat tu replacement schedule canh bao dinh ky dau boi tron loc" },
      { label: "Theo dõi vật tư", href: "/replacement-procedures", icon: ClipboardList, keywords: "theo doi vat tu quy trinh thay the huong dan checklist procedure replacement" },
    ],
  },
  {
    title: "QUẢN LÝ TÀI LIỆU SỐ",
    items: [
      { label: "Danh mục quy trình", href: "/documents/procedures", icon: FileText, keywords: "danh muc quy trinh van hanh procedure sop tai lieu so" },
      { label: "Sơ đồ P&ID", href: "/documents/pid", icon: Workflow, keywords: "danh muc so do pid p&id ban ve tai lieu ky thuat" },
      { label: "Forum kỹ thuật", href: "/forum", icon: MessagesSquare, keywords: "forum dien dan trao doi ky thuat tai lieu quy trinh so do ban ve" },
      {
        label: "Thư mục lưu trữ",
        href: "/documents/archive",
        icon: Archive,
        permissionIds: [
          "archive-grid-separation",
          "archive-startup-data",
          "archive-boiler-calibration",
          "archive-major-repair",
          "archive-oil-gun-data",
          "archive-soot-blower-data",
        ],
        keywords: "thu muc luu tru archive folder tai lieu so kho du lieu",
      },
    ],
  },
];

const STATISTICS_ALLOWED_SECTION_KEYS = new Set(["quan ly nguoi dung", "quan ly vat tu"]);

function navPathMatches(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(base + "/");
}

function positionValue(input?: PositionCarrier | string | null) {
  if (typeof input === "string") return input;
  return effectiveUserPosition(input);
}

export function isStatisticsPosition(input?: PositionCarrier | string | null) {
  const position = normalizeText(positionValue(input) ?? "");
  return position === "thong ke" || position.includes("thong ke");
}

export function navSectionAllowedForPosition(section: NavSection, input?: PositionCarrier | string | null) {
  if (!isStatisticsPosition(input)) return true;
  return STATISTICS_ALLOWED_SECTION_KEYS.has(normalizeText(section.title));
}

export function navSectionsForPosition(input?: PositionCarrier | string | null) {
  return NAV_SECTIONS.filter((section) => navSectionAllowedForPosition(section, input));
}

export function pathAllowedForPosition(pathname: string, input?: PositionCarrier | string | null) {
  if (!isStatisticsPosition(input)) return true;
  if (navPathMatches(pathname, "/account")) return true;
  return navSectionsForPosition(input).some((section) =>
    section.items.some((item) => navPathMatches(pathname, item.href) || item.children?.some((child) => navPathMatches(pathname, child.href)))
  );
}

/** Strip Vietnamese diacritics for accent-insensitive search. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
