import {
  LayoutDashboard,
  Megaphone,
  CalendarDays,
  Settings,
  Cpu,
  Wrench,
  Package,
  Repeat,
  History,
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
  Factory,
  Boxes,
  Database,
  FlaskConical,
  FlameKindling,
  MonitorCog,
  Calculator,
  Zap,
} from "lucide-react";
import { effectiveUserPosition, type PositionCarrier } from "@/lib/current-position";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  permissionIds?: string[];
  /** Chỉ hiện mục cho các cương vị đang làm việc khớp từ khóa; ADMIN luôn được phép. */
  allowedPositionKeywords?: readonly string[];
  /** Opens an external destination in a new browser tab. */
  external?: boolean;
  /** Extra search terms (accent-free) to improve topbar search matching. */
  keywords?: string;
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const MODEL_CONTROL_URL = "http://demoduyenhai1.site/";
export const MODEL_CONTROL_ALLOWED_POSITION_KEYWORDS = [
  "quản đốc",
  "phó quản đốc",
  "kỹ thuật viên",
  "trưởng ca",
  "TK Lò máy",
  "TKLM",
  "trưởng kíp lò máy",
  "trưởng kíp điện",
  "TK điện",
  "TKĐ",
] as const;

export const QDU_TOOL_URL =
  "https://docs.google.com/spreadsheets/d/1ntWvK0kx6Z9zlITa7kIegYXNzAZd00xDZ9oimdZMqX8/edit?usp=sharing";
export const QDU_TOOL_ALLOWED_POSITION_KEYWORDS = [
  "trưởng ca",
  "kỹ thuật viên",
  "phó quản đốc",
  "quản đốc",
] as const;

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
      { label: "Thông tin thiết bị", href: "/devices", icon: Cpu, permissionIds: ["device-view"], keywords: "device thiet bi may moc esp fgd boiler turbine" },
      {
        // Hai phần bám đúng hai Google Sheet nguồn (sheet Cơ và sheet Điện).
        label: "Khiếm khuyết thiết bị",
        href: "/defects?phan=co",
        icon: ShieldAlert,
        keywords: "defect su co fault khiem khuyet co dien",
        children: [
          { label: "Sheet Cơ - Hóa", href: "/defects?phan=co", icon: Wrench, keywords: "khiem khuyet co hoa syc sheet co moi truong hoa" },
          { label: "Sheet Điện", href: "/defects?phan=dien", icon: Zap, keywords: "khiem khuyet dien syc sheet dien moi truong" },
        ],
      },
      { label: "Lịch sử sửa chữa", href: "/repair-history", icon: Wrench, keywords: "repair sua chua bao tri history khiem khuyet" },
      {
        label: "Thiết bị PCCC",
        href: "/pccc",
        icon: FlameKindling,
        permissionIds: ["pccc-view"],
        keywords: "pccc phong chay chua chay binh chua chay bcc tu chua chay tcc foam co2 diesel fm200 ron lang phun ngam cuon ong an toan",
      },
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
  {
    title: "QUẢN LÝ VẬT TƯ",
    items: [
      {
        label: "Danh mục Vận Hành 1",
        href: "/materials",
        icon: Package,
        permissionIds: ["material-manage"],
        keywords: "material vat tu pxvh1 phu tung ton kho",
      },
      {
        label: "Vật tư theo ERP",
        href: "/vat-tu/loai-dau",
        icon: Database,
        keywords: "ton kho theo nhom vat tu loai dau loc dau hoa chat bi nghien than gom nhom erp de xuat nhap nguong canh bao",
      },
      {
        label: "Lịch thay thế vật tư",
        href: "/replacements",
        icon: Repeat,
        permissionIds: ["replacement-manage"],
        keywords: "lich thay the vat tu replacement schedule canh bao dinh ky dau boi tron loc",
      },
      { label: "Theo dõi vật tư", href: "/replacement-procedures", icon: ClipboardList, keywords: "theo doi vat tu quy trinh thay the huong dan checklist procedure replacement" },
      {
        label: "Lịch sử thay thế",
        href: "/replacement-history",
        icon: History,
        permissionIds: ["replacement-manage"],
        keywords: "lich su thay the vat tu history ghi nhan da thay luu tru so theo doi",
      },
    ],
  },
  {
    title: "QUẢN LÝ TÀI LIỆU SỐ",
    items: [
      { label: "Danh mục quy trình", href: "/documents/procedures", icon: FileText, keywords: "danh muc quy trinh van hanh procedure sop tai lieu so" },
      { label: "Sơ đồ P&ID", href: "/documents/pid", icon: Workflow, keywords: "danh muc so do pid p&id ban ve tai lieu ky thuat" },
      { label: "Forum kỹ thuật", href: "/forum", icon: MessagesSquare, keywords: "forum dien dan trao doi ky thuat tai lieu quy trinh so do ban ve" },
    ],
  },
  {
    title: "TIỆN ÍCH",
    items: [
      {
        label: "Kết quả phân tích dầu",
        href: "/tien-ich/phan-tich-dau",
        icon: FlaskConical,
        keywords: "lims ket qua phan tich dau khong dat mau dau thi nghiem hoa y kien pkt qlvh oil analysis tien ich",
      },
      {
        label: "Điều khiển mô hình DH1",
        href: "/api/model-control/open",
        icon: MonitorCog,
        external: true,
        allowedPositionKeywords: MODEL_CONTROL_ALLOWED_POSITION_KEYWORDS,
        keywords: "dieu khien mo hinh duyen hai 1 demo control simulation",
      },
      {
        label: "Công cụ tính QDU",
        href: "/api/qdu-tool/open",
        icon: Calculator,
        external: true,
        allowedPositionKeywords: QDU_TOOL_ALLOWED_POSITION_KEYWORDS,
        keywords: "cong cu tinh qdu google sheets bang tinh",
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

/** Kiểm tra ràng buộc cương vị riêng của một mục điều hướng. */
export function positionAllowedByKeywords(
  allowedKeywords: readonly string[],
  input?: PositionCarrier | string | null,
  role?: string
) {
  if (!allowedKeywords.length || role === "ADMIN") return true;
  const accessKey = (value: string) =>
    normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const position = accessKey(positionValue(input) ?? "");
  return Boolean(
    position &&
    allowedKeywords.some((keyword) => position.includes(accessKey(keyword)))
  );
}

export function navItemAllowedForPosition(
  item: NavItem,
  input?: PositionCarrier | string | null,
  role?: string
) {
  return positionAllowedByKeywords(item.allowedPositionKeywords ?? [], input, role);
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
