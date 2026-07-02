import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requestAuditMeta } from "@/lib/activity-log";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RBAC_CONFIG_KEY = "rbac-permissions";
const PERMISSION_VALUES = new Set(["full", "manage", "approve", "create", "own", "read", "none"]);
const ROLES = ["ADMIN", "MANAGER", "SUPERVISOR", "TECHNICIAN", "VIEWER"] as const;
type PermissionValue = "full" | "manage" | "approve" | "create" | "own" | "read" | "none";
const PERMISSION_RANK: Record<string, number> = {
  none: 0,
  read: 1,
  own: 2,
  create: 3,
  approve: 4,
  manage: 5,
  full: 6,
};

function parseJsonSafe(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRoles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id ?? "").trim(),
        label: String(item.label ?? "").trim(),
        desc: String(item.desc ?? "").trim(),
        scope: String(item.scope ?? "").trim(),
        accent: String(item.accent ?? "").trim() || "from-cyan-500 to-blue-600",
        custom: true,
      };
    })
    .filter((row) => row.id && row.label);
}

function validPermissionValue(value: unknown, fallback: PermissionValue = "none"): PermissionValue {
  const raw = String(value ?? fallback);
  return PERMISSION_VALUES.has(raw) ? (raw as PermissionValue) : fallback;
}

function strongestPermission(values: unknown[]): PermissionValue {
  return values.reduce<PermissionValue>((best, value) => {
    const current = validPermissionValue(value);
    return PERMISSION_RANK[current] > PERMISSION_RANK[best] ? current : best;
  }, "none");
}

function normalizePermissionRows(value: unknown, roleIds: string[]) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      const matrix = item.matrix as Record<string, unknown> | undefined;
      const normalizedMatrix = Object.fromEntries(
        roleIds.map((roleId) => {
          const fallback =
            roleId === "MANAGER" && ["announcement-manage", "material-manage"].includes(String(item.id ?? ""))
              ? "full"
              : roleId === "MANAGER"
                ? strongestPermission([matrix?.SUPERVISOR, matrix?.TECHNICIAN])
                : "none";
          return [roleId, validPermissionValue(matrix?.[roleId], fallback)];
        })
      );
      return {
        id: String(item.id ?? "").trim(),
        group: String(item.group ?? "").trim(),
        feature: String(item.feature ?? "").trim(),
        note: String(item.note ?? "").trim(),
        matrix: normalizedMatrix,
      };
    })
    .filter((row) => row.id && row.group && row.feature);
}

function normalizeUserOverrides(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      const permissionValue = String(item.value ?? "read");
      return {
        id: String(item.id ?? "").trim(),
        userId: String(item.userId ?? "").trim(),
        permissionId: String(item.permissionId ?? "").trim(),
        roleId: String(item.roleId ?? "").trim() || undefined,
        value: PERMISSION_VALUES.has(permissionValue) ? permissionValue : "read",
        note: String(item.note ?? "").trim() || undefined,
        createdAt: String(item.createdAt ?? new Date().toISOString()),
      };
    })
    .filter((row) => row.id && row.userId && row.permissionId);
}

export async function GET() {
  return handle(async () => {
    await requireUser();

    const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "RbacConfig" WHERE key = $1 LIMIT 1`,
      RBAC_CONFIG_KEY
    );
    const raw = Array.isArray(rows) ? rows[0]?.value : null;
    if (!raw) return ok({ permissions: [], roles: [], userOverrides: [] });

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const roles = normalizeRoles(parsed.roles);
      const roleIds = [...ROLES, ...roles.map((role) => role.id)];
      return ok({
        permissions: normalizePermissionRows(parsed.permissions, roleIds),
        roles,
        userOverrides: normalizeUserOverrides(parsed.userOverrides),
      });
    } catch {
      return ok({ permissions: [], roles: [], userOverrides: [] });
    }
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "rbac-manage", ["full"], "Không đủ quyền cập nhật ma trận phân quyền");

    const body = (await req.json()) as Record<string, unknown>;
    const roles = normalizeRoles(body.roles);
    const roleIds = [...ROLES, ...roles.map((role) => role.id)];
    const payload = {
      permissions: normalizePermissionRows(body.permissions, roleIds),
      roles,
      userOverrides: normalizeUserOverrides(body.userOverrides),
    };
    if (!payload.permissions.length) return fail("Vui lòng cấu hình ít nhất một quyền quản lý");
    const beforeRows = await prisma.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "RbacConfig" WHERE key = $1 LIMIT 1`,
      RBAC_CONFIG_KEY
    );
    const beforeData = parseJsonSafe(Array.isArray(beforeRows) ? beforeRows[0]?.value : null);

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "RbacConfig" (key, value, "updatedById", "updatedAt")
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, "updatedById" = EXCLUDED."updatedById", "updatedAt" = CURRENT_TIMESTAMP
      `,
      RBAC_CONFIG_KEY,
      JSON.stringify(payload),
      user.id
    );

    await audit(user.id, "UPDATE_RBAC_CONFIG", "RbacConfig", RBAC_CONFIG_KEY, "Cập nhật cấu hình phân quyền", {
      actorName: user.name,
      beforeData,
      afterData: payload,
      changedFields: ["permissions", "roles", "userOverrides"],
      ...requestAuditMeta(req),
    });
    return ok(payload);
  });
}
