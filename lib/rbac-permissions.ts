import { prisma } from "@/lib/prisma";
import { DEFAULT_RBAC_MATRIX } from "@/lib/rbac-defaults";

const RBAC_CONFIG_KEY = "rbac-permissions";
const ROLE_PROFILE_PERMISSION = "__ROLE_PROFILE__";
const MANAGE_LEVELS = new Set(["manage", "full"]);
const VIEW_LEVELS = new Set(["read", "personal", "manage", "full"]);
const FALLBACK_PERMISSION_IDS: Record<string, string[]> = {
  "hc-attendance-group-create": ["hc-attendance-check-in"],
  "repair-edit": ["repair-create", "defect-manage"],
};
export type PermissionLevel = "none" | "read" | "personal" | "manage" | "full";

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  personal: 2,
  manage: 3,
  full: 4,
};

type RbacPermission = {
  id: string;
  matrix?: Record<string, string>;
};

type RbacUserOverride = {
  userId: string;
  permissionId: string;
  roleId?: string;
  value?: string;
};

type RbacConfig = {
  permissions?: RbacPermission[];
  userOverrides?: RbacUserOverride[];
};

function permissionLevel(value: string | null | undefined): PermissionLevel {
  const raw = String(value ?? "none");
  // Tương thích cấu hình cũ: quyền "approve" đã được gộp vào "manage".
  if (raw === "approve") return "manage";
  // Tương thích cấu hình cũ: "create" và "own" được gộp vào "personal".
  if (raw === "create" || raw === "own") return "personal";
  return raw in PERMISSION_RANK ? (raw as PermissionLevel) : "none";
}

function strongestPermission(values: Array<string | null | undefined>): PermissionLevel {
  return values
    .map(permissionLevel)
    .reduce<PermissionLevel>((best, value) => (PERMISSION_RANK[value] > PERMISSION_RANK[best] ? value : best), "none");
}

// Bảng RbacConfig được khai báo trong prisma/schema.prisma và tạo bằng db push.
async function loadRbacConfig(): Promise<RbacConfig | null> {
  const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "RbacConfig" WHERE key = $1 LIMIT 1`,
    RBAC_CONFIG_KEY
  );
  const raw = Array.isArray(rows) ? rows[0]?.value : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RbacConfig;
  } catch {
    return null;
  }
}

// Cache config RBAC trong process (TTL ngắn) — hầu như mọi API đều check quyền
// (nhiều lần mỗi request); đọc DB + JSON.parse toàn bộ config mỗi lần rất tốn CPU.
// PUT /api/rbac gọi invalidateRbacConfigCache() ngay sau khi lưu.
const RBAC_CONFIG_CACHE_TTL_MS = 30_000;
let rbacConfigCache: { value: RbacConfig | null; expiresAt: number } | null = null;
let rbacConfigInFlight: Promise<RbacConfig | null> | null = null;

async function readRbacConfig(): Promise<RbacConfig | null> {
  if (rbacConfigCache && rbacConfigCache.expiresAt > Date.now()) return rbacConfigCache.value;
  if (rbacConfigInFlight) return rbacConfigInFlight;
  rbacConfigInFlight = loadRbacConfig()
    .then((value) => {
      rbacConfigCache = { value, expiresAt: Date.now() + RBAC_CONFIG_CACHE_TTL_MS };
      return value;
    })
    .finally(() => {
      rbacConfigInFlight = null;
    });
  return rbacConfigInFlight;
}

export function invalidateRbacConfigCache() {
  rbacConfigCache = null;
  rbacConfigInFlight = null;
}

function allowsView(value: string | null | undefined) {
  return VIEW_LEVELS.has(permissionLevel(value));
}

function allowsManage(value: string | null | undefined) {
  return MANAGE_LEVELS.has(permissionLevel(value));
}

function satisfiesAllowedLevels(level: PermissionLevel, allowed: PermissionLevel[]) {
  if (allowed.includes(level)) return true;
  if (level === "full") return allowed.some((required) => required !== "none");
  if (level === "manage") {
    return allowed.some((required) => ["read", "personal", "manage"].includes(required));
  }
  return false;
}

export async function assignedPermissionLevel(user: { id?: string; role?: string }, permissionId: string): Promise<PermissionLevel> {
  if (user.role === "ADMIN") return "full";
  if (!user.id) return "none";
  const config = await readRbacConfig();
  return assignedPermissionLevelFromConfig(user, permissionId, config);
}

function assignedPermissionLevelFromConfig(
  user: { id?: string; role?: string },
  permissionId: string,
  config: RbacConfig | null
): PermissionLevel {
  if (user.role === "ADMIN") return "full";
  if (!user.id) return "none";
  const canonicalPermissionId = permissionId === "defect-manage" ? "repair-edit" : permissionId;
  if (!config) return permissionLevel(DEFAULT_RBAC_MATRIX[permissionId]?.[user.role ?? ""]);

  const permissions = Array.isArray(config.permissions) ? config.permissions : [];
  const overrides = Array.isArray(config.userOverrides) ? config.userOverrides : [];
  const targetPermission = permissions.find((item) => item.id === canonicalPermissionId);
  const fallbackPermissionIds = FALLBACK_PERMISSION_IDS[canonicalPermissionId] ?? [];
  const fallbackPermission = fallbackPermissionIds
    .map((id) => permissions.find((item) => item.id === id))
    .find(Boolean);
  const roleValue =
    targetPermission?.matrix?.[user.role ?? ""] ??
    fallbackPermission?.matrix?.[user.role ?? ""] ??
    DEFAULT_RBAC_MATRIX[permissionId]?.[user.role ?? ""];
  const overrideValues = overrides
    .filter((override) => override.userId === user.id)
    .flatMap((override) => {
      if (override.permissionId === canonicalPermissionId || fallbackPermissionIds.includes(override.permissionId)) return [override.value];
      if (override.permissionId !== ROLE_PROFILE_PERMISSION || !override.roleId) return [];
      return [
        override.value,
        targetPermission?.matrix?.[override.roleId] ??
          fallbackPermission?.matrix?.[override.roleId] ??
          DEFAULT_RBAC_MATRIX[permissionId]?.[override.roleId],
      ];
    });

  return strongestPermission([roleValue, ...overrideValues]);
}

export async function assignedPermissionMap(user: { id?: string; role?: string }) {
  const config = await readRbacConfig();
  const configPermissionIds = Array.isArray(config?.permissions) ? config.permissions.map((permission) => permission.id) : [];
  const permissionIds = Array.from(new Set([...Object.keys(DEFAULT_RBAC_MATRIX), ...configPermissionIds]));
  return Object.fromEntries(
    permissionIds.map((permissionId) => [permissionId, assignedPermissionLevelFromConfig(user, permissionId, config)])
  ) as Record<string, PermissionLevel>;
}

export async function hasAssignedPermissionLevel(
  user: { id?: string; role?: string },
  permissionId: string,
  allowed: PermissionLevel[]
) {
  const level = await assignedPermissionLevel(user, permissionId);
  return satisfiesAllowedLevels(level, allowed);
}

export async function hasAssignedManagePermission(user: { id?: string; role?: string }, permissionId: string) {
  return allowsManage(await assignedPermissionLevel(user, permissionId));
}

export async function hasAssignedPermission(user: { id?: string; role?: string }, permissionId: string) {
  return allowsView(await assignedPermissionLevel(user, permissionId));
}
