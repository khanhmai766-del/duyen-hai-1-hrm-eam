import type { NavSection } from "@/lib/nav";
/** Giữ mã cũ để tài khoản đang dùng không cần chuyển đổi dữ liệu. */
export const LOOKUP_ACCESS_MODE = "DEFECT_READ_ONLY";
export const LOOKUP_CONFIG_KEY = "lookup-permissions";

export const LOOKUP_MODULES = [
  { id: "defects", label: "Khiếm khuyết", group: "Thiết bị & vận hành", pages: ["/defects"], apis: ["/api/defects", "/api/defect-history"], permissions: ["defect-view"] },
  { id: "work-permits", label: "Sổ cấp PCT", group: "Thiết bị & vận hành", pages: ["/work-permits"], apis: ["/api/work-permits"], permissions: ["work-permit-view"] },
  { id: "devices", label: "Thông tin thiết bị", group: "Thiết bị & vận hành", pages: ["/devices"], apis: ["/api/devices", "/api/device-qr-cards"], permissions: ["device-view"] },
  { id: "repair-history", label: "Lịch sử sửa chữa", group: "Thiết bị & vận hành", pages: ["/repair-history"], apis: ["/api/repair-history"], permissions: [] },
  { id: "pccc", label: "Thiết bị PCCC", group: "Thiết bị & vận hành", pages: ["/pccc"], apis: ["/api/pccc"], permissions: ["pccc-view"] },
  { id: "grounding", label: "Tiếp địa & chống sét", group: "Thiết bị & vận hành", pages: ["/grounding-lightning"], apis: ["/api/grounding-lightning"], permissions: ["grounding-lightning-view"] },
  { id: "tbycnn", label: "Thiết bị YCNN về ATLĐ", group: "Thiết bị & vận hành", pages: ["/tbycnn"], apis: ["/api/tbycnn"], permissions: ["tbycnn-view"] },
  { id: "reports", label: "Báo cáo thiết bị", group: "Thiết bị & vận hành", pages: ["/reports"], apis: ["/api/reports"], permissions: ["device-view"] },
  { id: "overview", label: "Tổng quan", group: "Thông tin chung", pages: ["/"], apis: ["/api/dashboard", "/api/safe-operation"], permissions: [] },
  { id: "notifications", label: "Mệnh lệnh sản xuất", group: "Thông tin chung", pages: ["/notifications"], apis: ["/api/announcements", "/api/operations"], permissions: ["announcement-manage", "operation-events"] },
  { id: "hr", label: "Lịch làm việc", group: "Thông tin chung", pages: ["/hr"], apis: ["/api/shifts", "/api/handover", "/api/hc-groups", "/api/hc-registrations", "/api/roster-schedule"], permissions: ["shift-operation-check-in", "hc-attendance-check-in"] },
  { id: "materials", label: "Danh mục vật tư Vận Hành 1", group: "Vật tư", pages: ["/materials"], apis: ["/api/materials", "/api/material-stock-movements"], permissions: ["material-manage", "material-view"] },
  { id: "erp-materials", label: "Vật tư theo ERP", group: "Vật tư", pages: ["/vat-tu"], apis: ["/api/vat-tu", "/api/erp-materials"], permissions: ["erp-material-manage"] },
  { id: "chemical-inventory", label: "Tịnh kho hóa chất", group: "Vật tư", pages: ["/chemical-inventory"], apis: ["/api/chemical-inventory"], permissions: ["chemical-inventory-manage"] },
  { id: "material-plans", label: "Kế hoạch vật tư năm / Nhu cầu tháng", group: "Vật tư", pages: ["/material-annual-plans"], apis: ["/api/material-annual-plans"], permissions: ["material-manage", "material-view"] },
  { id: "replacements", label: "Lịch thay thế vật tư", group: "Vật tư", pages: ["/replacements"], apis: ["/api/material-replacements"], permissions: ["replacement-manage", "replacement-view"] },
  { id: "material-tickets", label: "Theo dõi vật tư", group: "Vật tư", pages: ["/replacement-procedures"], apis: ["/api/material-tickets"], permissions: ["material-manage", "material-view"] },
  { id: "replacement-history", label: "Lịch sử thay thế", group: "Vật tư", pages: ["/replacement-history"], apis: ["/api/material-replacements/history"], permissions: ["replacement-manage", "replacement-view"] },
  { id: "procedures", label: "Danh mục quy trình", group: "Tài liệu số", pages: ["/documents/procedures"], apis: [], permissions: ["document-procedure"] },
  { id: "pid", label: "Sơ đồ P&ID", group: "Tài liệu số", pages: ["/documents/pid"], apis: [], permissions: ["document-pid"] },
  { id: "archive", label: "Thư mục lưu trữ", group: "Tài liệu số", pages: ["/documents/archive"], apis: ["/api/bgts-tuabin-ngung", "/api/voi-dot", "/api/soot-blowers", "/api/oil-guns"], permissions: ["archive-read", "archive-grid-separation", "archive-startup-data", "archive-boiler-calibration", "archive-oil-gun-data", "archive-soot-blower-data"] },
  { id: "contracts", label: "Quản lý hợp đồng", group: "Tài liệu số", pages: ["/documents/contracts"], apis: ["/api/tcms"], permissions: ["contract-access"] },
  { id: "forum", label: "Forum kỹ thuật", group: "Tài liệu số", pages: ["/forum"], apis: ["/api/forum"], permissions: [] },
  { id: "overhaul", label: "Tiến độ đại tu", group: "Tiện ích", pages: ["/tien-ich/tien-do-dai-tu"], apis: ["/api/overhaul-progress", "/api/overhaul-milestones"], permissions: [] },
  { id: "oil-analysis", label: "Kết quả phân tích dầu", group: "Tiện ích", pages: ["/tien-ich/phan-tich-dau"], apis: ["/api/lims/oil-analysis"], permissions: [] },
] as const;

export type LookupModuleId = typeof LOOKUP_MODULES[number]["id"];
export type LookupConfig = { users: Record<string, LookupModuleId[]> };
/** Mục mọi tài khoản tra cứu luôn xem được, không cần tick (07/10/2026: Tiến độ đại tu mở cho tất cả). */
export const ALWAYS_LOOKUP_MODULES: LookupModuleId[] = ["overhaul"];
export const DEFAULT_LOOKUP_MODULES: LookupModuleId[] = ["defects", ...ALWAYS_LOOKUP_MODULES];
const moduleIds = new Set<string>(LOOKUP_MODULES.map(module => module.id));
export function isLookupModuleId(value: unknown): value is LookupModuleId {
  return typeof value === "string" && moduleIds.has(value);
}
export function lookupModulesForUser(config: LookupConfig, userId: string): LookupModuleId[] {
  return [...new Set([...(config.users[userId] ?? DEFAULT_LOOKUP_MODULES), ...ALWAYS_LOOKUP_MODULES])];
}
export function normalizeLookupConfig(value: unknown): LookupConfig {
  const raw = value && typeof value === "object" ? (value as { users?: unknown }).users : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { users: {} };
  return { users: Object.fromEntries(Object.entries(raw).flatMap(([id, ids]) =>
    Array.isArray(ids) ? [[id, [...new Set(ids.filter(isLookupModuleId))]]] : [])) };
}
export function lookupPermissionIds(modules: readonly LookupModuleId[]): string[] {
  const ids: string[] = LOOKUP_MODULES.filter(module => modules.includes(module.id)).flatMap(module => [...module.permissions]);
  // Cây thiết bị dùng để lọc/hiển thị tên ở các sổ; quyền mở trang Thiết bị vẫn được kiểm tra riêng.
  if (modules.some(id => ["defects", "materials", "replacements", "replacement-history", "material-tickets"].includes(id))) ids.push("device-view");
  return [...new Set(ids)];
}
function matches(pathname: string, prefix: string) {
  return pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`));
}
export function lookupPageAllowed(href: string, modules: readonly LookupModuleId[]) {
  const pathname = href.split("?")[0];
  return LOOKUP_MODULES.some(module => modules.includes(module.id) && module.pages.some(prefix => matches(pathname, prefix)));
}
export function lookupLandingPage(modules: readonly LookupModuleId[]) {
  return modules.includes("defects") ? "/defects?phan=co" : LOOKUP_MODULES.find(module => modules.includes(module.id))?.pages[0] ?? "/account";
}
export function lookupNavSections(sections: NavSection[], modules: readonly LookupModuleId[]): NavSection[] {
  return sections.map(section => ({ ...section, items: section.items.flatMap(item => {
    const children = item.children?.filter(child => lookupPageAllowed(child.href, modules));
    if (item.children) return children?.length ? [{ ...item, href: lookupPageAllowed(item.href, modules) ? item.href : children[0].href, children }] : [];
    return lookupPageAllowed(item.href, modules) ? [item] : [];
  }) })).filter(section => section.items.length > 0);
}
/** Không dùng HTTP GET làm bằng chứng duy nhất: các GET phục vụ quản trị vẫn bị chặn. */
export function lookupRequestAllowed(url: URL, method: string, modules: readonly LookupModuleId[]) {
  const path = url.pathname;
  if (["/api/me", "/api/me/password"].includes(path)) return ["GET", "PUT"].includes(method);
  if (path === "/api/rbac/me") return method === "GET";
  if (path === "/api/device-qr/resolve") return method === "POST";
  if (matches(path, "/api/ai")) return modules.includes("defects") &&
    !matches(path, "/api/ai/stats"); // Trợ lý tra khiếm khuyết hiện có, chưa mở công cụ phân hệ khác.
  if (method !== "GET" && method !== "HEAD") return false;
  if (path === "/account" || path === "/devices/scan" || matches(path, "/public/equipment") || matches(path, "/public/devices")) return true;
  if (path === "/api/me/dashboard" || path === "/api/broadcast") return true;
  if (path === "/api/users") return url.searchParams.get("summary") === "1";
  if (matches(path, "/api/files/s3")) return true; // Kiểm tra khoá tệp trong route.
  if (matches(path, "/api/equipment-tree")) return modules.some(id => ["defects", "devices", "reports", "materials", "replacements", "replacement-history", "material-tickets"].includes(id)) && !url.searchParams.has("includeAll");
  if (matches(path, "/api/documents")) {
    if (path !== "/api/documents") return modules.some(id => ["procedures", "pid", "archive"].includes(id));
    const category = url.searchParams.get("category");
    return modules.includes(category === "PROCEDURE" ? "procedures" : category === "PID" ? "pid" : "archive");
  }
  if (/^\/api\/work-permits\/(number-|nkvh-|employees|name-suggestions|overhaul-items(?:\/|$))/.test(path)) return false;
  if (/^\/api\/defects\/(sync|two-way-sync)(?:\/|$)/.test(path) || /\/request-number$/.test(path)) return false;
  if (matches(path, "/api/tcms/admin") || matches(path, "/api/tcms/audit") || /\/(new|edit|settings|admin)(?:\/|$)/.test(path)) return false;
  if (matches(path, "/api/material-replacements/history")) return modules.includes("replacement-history") || modules.includes("replacements");
  return path.startsWith("/api/")
    ? LOOKUP_MODULES.some(module => modules.includes(module.id) && module.apis.some(prefix => matches(path, prefix)))
    : lookupPageAllowed(path, modules);
}
