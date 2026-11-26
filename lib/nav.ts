import {
  Activity,
  Vibrate,
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
  FileSignature,
  ListChecks,
  Archive,
  Workflow,
  BellRing,
  Sparkles,
  ClipboardList,
  Factory,
  Boxes,
  Database,
  FlaskConical,
  FileCheck2,
  FlameKindling,
  MonitorCog,
  Calculator,
  FileSpreadsheet,
  CalendarRange,
  Zap,
  Gauge,
  HardHat,
  RadioTower,
  ListTodo,
  UserCog,
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
  /** Chỉ active khi pathname khớp chính xác, không active theo route con. */
  exact?: boolean;
  /** Extra search terms (accent-free) to improve topbar search matching. */
  keywords?: string;
  /** Mục con; một mục con có thể có mục con riêng (tối đa 3 cấp, vd Nhập thông số độ rung › Phân tích độ rung › …). */
  children?: NavItem[];
}

/** Các mục lá (có trang) dưới một mục: mục con thường + mục con của mục con nhóm. */
export function flatNavChildren(item: NavItem): NavItem[] {
  return (item.children ?? []).flatMap((child) => (child.children?.length ? child.children : [child]));
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const MODEL_CONTROL_URL = "http://3dplus-twin.local/";
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

export const ASH_SLAG_LOG_URL =
  "https://docs.google.com/spreadsheets/d/1RyWmVWOuJTaQov2Eg7Y-ZxxWhez66RK5XY7seO4ppfE/edit?gid=0#gid=0";
export const VIBRATION_MONITOR_URL = "https://pxvh1.infinityfree.me/";
export const PMIS_REPORT_URL = "/chi-tieu-ktkt/pmis-report";

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Quản lý người dùng",
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard, keywords: "tong quan dashboard bang dieu khien" },
      { label: "Mệnh lệnh sản xuất", href: "/notifications", icon: Megaphone, keywords: "menh lenh san xuat production order thong bao notification bang tin canh bao loa" },
      { label: "Lịch làm việc", href: "/hr", icon: CalendarDays, keywords: "ca truc shift roster diem danh org chart so do" },
      { label: "Quản lý công việc", href: "/work-tasks", icon: ListTodo, keywords: "quan ly cong viec giao viec task chu tri chi dao bao cao thuc hien" },
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
          { label: "Chất lượng trợ lý AI", href: "/admin/ai", icon: Sparkles, permissionIds: ["ai-chat"], keywords: "ai chatbox chat luong danh gia so lieu tro ly dh1 ops insight thong ke" },
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
        label: "Nhập thông số độ rung",
        href: "/devices/vibration/weekly",
        icon: Vibrate,
        permissionIds: ["vibration-view"],
        keywords: "do rung nhiet do thong so rung vibration nhap so do theo ky mill nghien mnk may nen khi tbnt tram bom nuoc tho anh xa",
        children: [
          { label: "Theo kỳ", href: "/devices/vibration/weekly", icon: CalendarRange, permissionIds: ["vibration-view"], keywords: "do rung theo ky hang tuan thu 5 tuan" },
          { label: "Mill theo ca", href: "/devices/vibration/mill", icon: Factory, permissionIds: ["vibration-view"], keywords: "do rung mill may nghien theo ca dau vrl" },
          { label: "MNK theo ca", href: "/devices/vibration/mnk", icon: Gauge, permissionIds: ["vibration-view"], keywords: "do rung mnk may nen khi theo ca" },
          { label: "TBNT theo ca", href: "/devices/vibration/tbnt", icon: Boxes, permissionIds: ["vibration-view"], keywords: "do rung tbnt tram bom nuoc tho theo ca" },
          {
            label: "Phân tích độ rung",
            href: "/devices/vibration/analysis",
            icon: Activity,
            permissionIds: ["vibration-view"],
            keywords: "phan tich do rung theo doi xu huong mill danh muc thiet bi cau hinh vung do anh xa",
            children: [
          { label: "Phân tích độ rung", href: "/devices/vibration/analysis", icon: Activity, permissionIds: ["vibration-view"], keywords: "phan tich do rung theo doi xu huong iso wowk tieu chuan nguong canh bao" },
          { label: "Phân tích độ rung MILL", href: "/devices/vibration/mill-analysis", icon: BarChart3, permissionIds: ["vibration-view"], keywords: "phan tich do rung mill may nghien goi xu huong" },
          { label: "Danh mục thiết bị", href: "/devices/vibration/catalog", icon: ListChecks, permissionIds: ["vibration-view"], keywords: "danh muc thiet bi do rung cuong vi he thong thong so may" },
          { label: "Cấu hình vùng đo", href: "/devices/vibration/measurements", icon: Settings, permissionIds: ["vibration-view"], keywords: "cau hinh vung do diem do ky do nguong canh bao" },
          { label: "Ánh xạ thiết bị", href: "/devices/vibration/mapping", icon: Workflow, permissionIds: ["vibration-manage"], keywords: "do rung anh xa thiet bi cay thiet bi lien ket mapping" },
            ],
          },
        ],
      },
      {
        // Hai sheet khiếm khuyết và sổ PCT liên kết với SYC.
        label: "Khiếm khuyết thiết bị",
        href: "/defects?phan=co",
        icon: ShieldAlert,
        keywords: "defect su co fault khiem khuyet co dien pct phieu cong tac",
        children: [
          { label: "Sheet Cơ - Hóa", href: "/defects?phan=co", icon: Wrench, keywords: "khiem khuyet co hoa syc sheet co moi truong hoa" },
          { label: "Sheet Điện", href: "/defects?phan=dien", icon: Zap, keywords: "khiem khuyet dien syc sheet dien moi truong" },
          { label: "Sổ cấp phiếu công tác", href: "/work-permits", icon: ClipboardList, keywords: "pct phieu cong tac co nhiet hoa dien cap phieu giao ca" },
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
        label: "Tiếp địa & chống sét",
        href: "/grounding-lightning",
        icon: RadioTower,
        permissionIds: ["grounding-lightning-view"],
        keywords: "tiep dia chong set lightning grounding kiem tra an toan dien",
      },
      {
        label: "Thiết bị YCNN về ATLĐ",
        href: "/tbycnn",
        icon: HardHat,
        permissionIds: ["tbycnn-view"],
        keywords:
          "tbycnn thiet bi yeu cau nghiem ngat an toan lao dong atld kiem dinh van an toan thiet bi ap luc thiet bi nang dien phong no duong ong ap luc dong ho ap luc qua han",
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
        permissionIds: ["erp-material-manage"],
        keywords: "ton kho theo nhom vat tu loai dau loc dau hoa chat chai khi bi nghien than gom nhom erp de xuat nhap nguong canh bao",
      },
      {
        label: "Tịnh kho hóa chất",
        href: "/chemical-inventory",
        icon: FlaskConical,
        permissionIds: ["chemical-inventory-manage"],
        keywords:
          "ton kho hoa chat nh3 amoniac naoh xut hcl axit naclo javen pac nh4oh bon dau hfo diesel do chua chay nhat ky ngay suat hao dau cuc hop dong nhap hoa chat",
      },
      {
        label: "Kế hoạch vật tư năm",
        href: "/material-annual-plans",
        icon: Calculator,
        exact: true,
        permissionIds: ["material-manage"],
        keywords: "ke hoach vat tu nam qlvt20 du toan nhu cau luy ke su dung ton kho",
      },
      {
        label: "Nhu cầu vật tư tháng",
        href: "/material-annual-plans/monthly",
        icon: CalendarRange,
        permissionIds: ["material-manage"],
        keywords: "bieu tong hop nhu cau vat tu thang qlvt20 xuat excel du toan nam sau luy ke da su dung",
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
      { label: "Quản lý hợp đồng", href: "/documents/contracts", icon: FileSignature, permissionIds: ["contract-access"], keywords: "quan ly hop dong nha thau tien do nghiem thu" },
      { label: "Danh mục quy trình", href: "/documents/procedures", icon: ListChecks, keywords: "danh muc quy trinh van hanh procedure sop tai lieu so" },
      { label: "Sơ đồ P&ID", href: "/documents/pid", icon: Workflow, keywords: "danh muc so do pid p&id ban ve tai lieu ky thuat" },
      { label: "Forum kỹ thuật", href: "/forum", icon: MessagesSquare, keywords: "forum dien dan trao doi ky thuat tai lieu quy trinh so do ban ve" },
    ],
  },
  {
    title: "QUẢN LÝ CHỈ TIÊU KTKT",
    items: [
      { label: "Dữ liệu các tháng", href: "/chi-tieu-ktkt", icon: CalendarRange, permissionIds: ["ctktkt-access"], exact: true, keywords: "ctktkt du lieu thang chi tieu kinh te ky thuat pmis ppa san xuat" },
      { label: "Báo cáo Chỉ tiêu KTKT", href: "/chi-tieu-ktkt/ctktkt-report", icon: FileSpreadsheet, permissionIds: ["ctktkt-access"], keywords: "ctktkt chi tieu kinh te ky thuat pmis ppa san xuat" },
      { label: "Báo cáo sản xuất", href: "/chi-tieu-ktkt/bcsx-report", icon: ClipboardList, permissionIds: ["ctktkt-access"], keywords: "ctktkt chi tieu kinh te ky thuat pmis ppa san xuat" },
      { label: "Theo dõi lượng nước", href: "/chi-tieu-ktkt/water-report", icon: Gauge, permissionIds: ["ctktkt-access"], keywords: "ctktkt chi tieu kinh te ky thuat pmis ppa san xuat" },
      { label: "Theo dõi hóa chất, dầu DO", href: "/chi-tieu-ktkt/chemical-usage", icon: FlaskConical, permissionIds: ["ctktkt-access"], keywords: "ctktkt chi tieu kinh te ky thuat pmis ppa san xuat dau do diesel" },
      { label: "Suất hao nhiệt PPA", href: "/chi-tieu-ktkt/ppa-heat-rate", icon: BarChart3, permissionIds: ["ctktkt-access"], keywords: "ctktkt chi tieu kinh te ky thuat pmis ppa san xuat" },
      { label: "Báo cáo PMIS", href: "/chi-tieu-ktkt/pmis-report", icon: Gauge, permissionIds: ["ctktkt-access"], keywords: "ctktkt chi tieu kinh te ky thuat pmis ppa san xuat" },
      { label: "Phân công nhập liệu", href: "/chi-tieu-ktkt/phan-quyen", icon: UserCog, permissionIds: ["ctktkt-delegate"], keywords: "ctktkt phan cong nhap lieu phan quyen giao quyen tkd truong ca" },
    ],
  },
  {
    title: "TIỆN ÍCH",
    items: [
      // Đợt đại tu S2 (06/10–04/12/2026) — gỡ mục này khi hết đợt.
      {
        label: "Tiến độ đại tu",
        href: "/tien-ich/tien-do-dai-tu",
        icon: CalendarRange,
        permissionIds: ["utility-overhaul-view"],
        keywords: "tien do dai tu s2 hang muc nhat ky ngay google sheet lo hoi turbine may phat c&i overhaul",
      },
      {
        label: "Kết quả phân tích dầu",
        href: "/tien-ich/phan-tich-dau",
        icon: FlaskConical,
        permissionIds: ["utility-oil-analysis-view"],
        keywords: "lims ket qua phan tich dau khong dat mau dau thi nghiem hoa y kien pkt qlvh oil analysis tien ich",
      },
      {
        label: "Chuẩn thể thức văn bản",
        href: "/tien-ich/chuan-the-thuc",
        icon: FileCheck2,
        permissionIds: ["utility-chuan-the-thuc-view"],
        keywords: "chuan the thuc van ban hanh chinh nd 30 2020 qd 739 evn kiem tra sua docx word chinh ta gemini tien ich",
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
        label: "Sổ theo dõi tro xỉ",
        href: ASH_SLAG_LOG_URL,
        icon: FileSpreadsheet,
        external: true,
        keywords: "so theo doi tro xi google sheets nhat ky ash slag",
      },
      {
        label: "GS thiết bị quay + báo cáo kỳ",
        href: VIBRATION_MONITOR_URL,
        icon: Vibrate,
        external: true,
        keywords: "giam sat do rung thiet bi quay bao cao ky vibration rung dong co bom quat pxvh1",
      },
    ],
  },
];

/**
 * Nhóm "Thường dùng" ở đầu thanh bên: các mục hay mở nhất, luôn hiện sẵn (không phải sổ nhóm). Chỉ khai href —
 * nhãn, biểu tượng và quyền lấy từ chính mục gốc trong NAV_SECTIONS (mục gốc vẫn ở chỗ cũ).
 */
export const NAV_QUICK_HREFS = ["/defects?phan=co", "/defects?phan=dien", "/work-permits", "/replacement-procedures", "/hr"] as const;

export function navQuickItems(input?: PositionCarrier | string | null): NavItem[] {
  const all = navSectionsForPosition(input).flatMap((section) => section.items.flatMap((item) => [item, ...flatNavChildren(item)]));
  return NAV_QUICK_HREFS.map((href) => all.find((item) => item.href === href && !item.children?.length))
    .filter((item): item is NavItem => Boolean(item));
}

const STATISTICS_ALLOWED_SECTION_KEYS = new Set(["quan ly nguoi dung", "quan ly vat tu", "quan ly chi tieu ktkt"]);
// Cương vị Thống kê chỉ thấy riêng các mục này trong nhóm Tiện ích (quyền mở trang vẫn kiểm tra như thường).
const STATISTICS_ALLOWED_UTILITY_HREFS = new Set(["/tien-ich/chuan-the-thuc"]);

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
  return STATISTICS_ALLOWED_SECTION_KEYS.has(normalizeText(section.title))
    || section.items.some((item) => STATISTICS_ALLOWED_UTILITY_HREFS.has(item.href));
}

export function navSectionsForPosition(input?: PositionCarrier | string | null) {
  return NAV_SECTIONS.filter((section) => navSectionAllowedForPosition(section, input)).map((section) =>
    !isStatisticsPosition(input) || STATISTICS_ALLOWED_SECTION_KEYS.has(normalizeText(section.title))
      ? section
      : { ...section, items: section.items.filter((item) => STATISTICS_ALLOWED_UTILITY_HREFS.has(item.href)) });
}

export function pathAllowedForPosition(pathname: string, input?: PositionCarrier | string | null) {
  if (!isStatisticsPosition(input)) return true;
  if (navPathMatches(pathname, "/account")) return true;
  return navSectionsForPosition(input).some((section) =>
    section.items.some((item) => navPathMatches(pathname, item.href) || flatNavChildren(item).some((child) => navPathMatches(pathname, child.href)))
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
