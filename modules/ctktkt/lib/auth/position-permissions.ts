import { normalizeText } from "@/lib/nav";
import { positionLabelOf } from "@/lib/position-catalog";
import { DEFAULT_POSITIONS } from "./default-positions";
import { migrateLegacyPermissions } from "./permission-migration";
import { PERMISSIONS, PERMISSION_LABELS, isAdminUser, type Permission, type SessionUser } from "./session";

// Quyền bao trùm được quy đổi sang từng nhóm để bỏ chọn một nhóm có hiệu lực thật.
const UMBRELLA = ["view_all", "edit_ctktkt", "edit_water", "edit_chemical"] as const;
export type PositionPermission = Exclude<Permission, (typeof UMBRELLA)[number]>;
export const POSITION_PERMISSION_IDS = PERMISSIONS.filter((p): p is PositionPermission => !(UMBRELLA as readonly string[]).includes(p));
export type PositionGrants = Record<PositionPermission, string[]>;
export type PositionPermissionConfig = { schemaVersion: 1; version: number; grants: PositionGrants };
export const CTKTKT_PERMISSION_GROUPS = [
  { label: "Quản trị và dữ liệu", ids: ["manage_users", "manage_permissions", "backup_data", "restore_data", "view_data_history"] },
  { label: "Số liệu, báo cáo và đồng bộ", ids: ["edit_monthly_kpi", "edit_daily_inputs", "edit_ppa", "edit_pmis", "edit_bcsx", "sync_qlkt", "sync_google_sheet"] },
  { label: "Báo cáo Chỉ tiêu KTKT", ids: POSITION_PERMISSION_IDS.filter(p => p.startsWith("ctktkt_")) },
  { label: "Theo dõi lượng nước", ids: POSITION_PERMISSION_IDS.filter(p => p.startsWith("water_")) },
  { label: "Theo dõi hóa chất", ids: POSITION_PERMISSION_IDS.filter(p => p.startsWith("chemical_")) },
].map(group => ({ ...group, ids: group.ids as PositionPermission[] }));
export const POSITION_PERMISSION_LABELS = {
  ...PERMISSION_LABELS, manage_users: "Toàn quyền KTKT",
};

export function ctktktPositionKey(value: string) {
  return normalizeText(positionLabelOf(value)).replace(/\s+s[12]$/i, "").trim();
}
export function ctktktPositionLabel(value: string) {
  const key = ctktktPositionKey(value);
  return DEFAULT_POSITIONS.find(p => ctktktPositionKey(p.position) === key)?.position || positionLabelOf(value).trim();
}
export function emptyPositionGrants(): PositionGrants {
  const grants = {} as PositionGrants;
  for (const id of POSITION_PERMISSION_IDS) grants[id] = [];
  return grants;
}

export function defaultPositionGrants(): PositionGrants {
  const grants = emptyPositionGrants();
  for (const policy of DEFAULT_POSITIONS) {
    const reference: SessionUser = { id: "default-policy", username: "", displayName: "", position: policy.position, role: policy.role, permissions: [...policy.permissions] };
    const original = new Set(isAdminUser(reference) ? PERMISSIONS : migrateLegacyPermissions(reference));
    for (const id of POSITION_PERMISSION_IDS) {
      const allowed = original.has(id)
        || (id.startsWith("ctktkt_") && original.has("edit_ctktkt"))
        || (id.startsWith("water_") && original.has("edit_water"))
        || (id.startsWith("chemical_") && original.has("edit_chemical"));
      if (allowed) grants[id].push(policy.position);
    }
  }
  return grants;
}

/** Mọi quyền phải được gửi đủ. Mảng rỗng là thu hồi, không phục hồi mặc định. */
export function validatePositionGrants(input: unknown): PositionGrants {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Bảng phân quyền KTKT không hợp lệ.");
  const source = input as Record<string, unknown>;
  if (Object.keys(source).length !== POSITION_PERMISSION_IDS.length || Object.keys(source).some(key => !POSITION_PERMISSION_IDS.includes(key as PositionPermission))) throw new Error("Bảng phân quyền phải có đủ các nhóm quyền KTKT hiện tại.");
  const grants = emptyPositionGrants();
  for (const id of POSITION_PERMISSION_IDS) {
    const values = source[id];
    if (!Array.isArray(values) || values.length > 200) throw new Error("Danh sách cương vị được cấp quyền không hợp lệ.");
    const seen = new Set<string>();
    for (const value of values) {
      if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Tên cương vị trong bảng phân quyền không hợp lệ.");
      const key = ctktktPositionKey(value);
      if (!key) throw new Error("Tên cương vị không được để trống.");
      if (!seen.has(key)) grants[id].push(ctktktPositionLabel(value));
      seen.add(key);
    }
  }
  return grants;
}

export function permissionsForPosition(position: string, grants: PositionGrants): Permission[] {
  const key = ctktktPositionKey(position);
  const selected = POSITION_PERMISSION_IDS.filter(id => key && grants[id].some(p => ctktktPositionKey(p) === key));
  if (selected.includes("manage_users")) return [...PERMISSIONS];
  const permissions: Permission[] = ["view_all", ...selected];
  for (const [umbrella, prefix] of [["edit_ctktkt", "ctktkt_"], ["edit_water", "water_"], ["edit_chemical", "chemical_"]] as const) {
    const children = POSITION_PERMISSION_IDS.filter(id => id.startsWith(prefix));
    if (children.every(id => selected.includes(id))) permissions.push(umbrella);
  }
  return permissions;
}

export function positionPermissionOptions(values: string[], grants: PositionGrants) {
  const options = new Map<string, string>();
  for (const value of [...DEFAULT_POSITIONS.map(p => p.position), ...values, ...Object.values(grants).flat()]) {
    if (value.trim()) options.set(ctktktPositionKey(value), ctktktPositionLabel(value));
  }
  return [...options.values()].sort((a, b) => a.localeCompare(b, "vi"));
}
