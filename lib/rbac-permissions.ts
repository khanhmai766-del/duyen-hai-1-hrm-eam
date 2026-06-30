import { prisma } from "@/lib/prisma";

const RBAC_CONFIG_KEY = "rbac-permissions";
const ROLE_PROFILE_PERMISSION = "__ROLE_PROFILE__";
const APPROVE_LEVELS = new Set(["approve", "manage", "full"]);
const VIEW_LEVELS = new Set(["read", "own", "create", "approve", "manage", "full"]);

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

async function ensureRbacConfigTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RbacConfig" (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      "updatedById" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function readRbacConfig(): Promise<RbacConfig | null> {
  await ensureRbacConfigTable();
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

function allowsApprove(value: string | null | undefined) {
  return APPROVE_LEVELS.has(String(value ?? "none"));
}

function allowsView(value: string | null | undefined) {
  return VIEW_LEVELS.has(String(value ?? "none"));
}

export async function hasAssignedApprovePermission(user: { id?: string; role?: string }, permissionId: string) {
  if (!user.id) return false;
  const config = await readRbacConfig();
  if (!config) return false;

  const permissions = Array.isArray(config.permissions) ? config.permissions : [];
  const overrides = Array.isArray(config.userOverrides) ? config.userOverrides : [];
  const targetPermission = permissions.find((item) => item.id === permissionId);
  if (allowsApprove(targetPermission?.matrix?.[user.role ?? ""])) return true;

  return overrides.some((override) => {
    if (override.userId !== user.id) return false;
    if (override.permissionId === permissionId) return allowsApprove(override.value);
    if (override.permissionId !== ROLE_PROFILE_PERMISSION || !override.roleId) return false;
    return allowsApprove(override.value) || allowsApprove(targetPermission?.matrix?.[override.roleId]);
  });
}

export async function hasAssignedPermission(user: { id?: string; role?: string }, permissionId: string) {
  if (user.role === "ADMIN") return true;
  if (!user.id) return false;
  const config = await readRbacConfig();
  if (!config) return false;

  const permissions = Array.isArray(config.permissions) ? config.permissions : [];
  const overrides = Array.isArray(config.userOverrides) ? config.userOverrides : [];
  const targetPermission = permissions.find((item) => item.id === permissionId);
  if (allowsView(targetPermission?.matrix?.[user.role ?? ""])) return true;

  return overrides.some((override) => {
    if (override.userId !== user.id) return false;
    if (override.permissionId === permissionId) return allowsView(override.value);
    if (override.permissionId !== ROLE_PROFILE_PERMISSION || !override.roleId) return false;
    return allowsView(override.value) || allowsView(targetPermission?.matrix?.[override.roleId]);
  });
}
