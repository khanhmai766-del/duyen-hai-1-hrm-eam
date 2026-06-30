import { Prisma, type ActivityLogCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ActionConfig = {
  category: ActivityLogCategory;
  saveToAuditLog?: boolean;
  label?: string;
};

const SYSTEM_ACTIONS = [
  "UPDATE_RBAC_CONFIG",
  "CREATE_USER",
  "UPDATE_USER",
  "DELETE_USER",
  "PERMANENT_DELETE_USER",
  "DEACTIVATE_USER",
  "ACTIVATE_USER",
  "IMPORT_USERS",
  "PREVIEW_IMPORT_USERS",
  "IMPORT_USERS_PREVIEW",
  "UPLOAD_USER_AVATAR",
  "UPLOAD_USER_SIGNATURE",
  "BULK_UPLOAD_USER_AVATAR",
  "BULK_UPLOAD_USER_SIGNATURE",
  "UPLOAD_USER_AVATARS_ZIP",
  "UPLOAD_USER_SIGNATURES_ZIP",
  "CREATE_BROADCAST",
  "UPDATE_BROADCAST",
  "DELETE_BROADCAST",
] as const;

const ATTENDANCE_ACTION_PREFIXES = ["CHECK_IN", "APPROVE_CHECKIN", "REMOVE_CHECKIN", "RECALL_CHECKIN", "HC_", "CREATE_HANDOVER"];
const SECURITY_ACTIONS = ["CHANGE_PASSWORD", "RESET_PASSWORD", "LOGIN", "LOGOUT", "WEBAUTHN_LOGIN"] as const;

export const ACTION_CONFIG: Record<string, ActionConfig> = Object.fromEntries([
  ...SYSTEM_ACTIONS.map((action) => [action, { category: "SYSTEM", saveToAuditLog: true }] as const),
  ...SECURITY_ACTIONS.map((action) => [action, { category: "SECURITY", saveToAuditLog: false }] as const),
  ["UPDATE_RBAC_CONFIG", { category: "SYSTEM", saveToAuditLog: true, label: "Cập nhật phân quyền" }],
  ["UPDATE_USER", { category: "SYSTEM", saveToAuditLog: true, label: "Cập nhật người dùng" }],
  ["CREATE_USER", { category: "SYSTEM", saveToAuditLog: true, label: "Tạo người dùng" }],
  ["DELETE_USER", { category: "SYSTEM", saveToAuditLog: true, label: "Xoá người dùng" }],
  ["PERMANENT_DELETE_USER", { category: "SYSTEM", saveToAuditLog: true, label: "Xoá vĩnh viễn người dùng" }],
  ["DEACTIVATE_USER", { category: "SYSTEM", saveToAuditLog: true, label: "Khoá người dùng" }],
  ["ACTIVATE_USER", { category: "SYSTEM", saveToAuditLog: true, label: "Mở khoá người dùng" }],
  ["IMPORT_USERS", { category: "SYSTEM", saveToAuditLog: true, label: "Import người dùng" }],
]) as Record<string, ActionConfig>;

function inferCategory(action: string): ActivityLogCategory {
  const configured = ACTION_CONFIG[action]?.category;
  if (configured) return configured;
  if (ATTENDANCE_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))) return "ATTENDANCE";
  if (action.includes("PASSWORD") || action.includes("AUTH") || action.includes("LOGIN")) return "SECURITY";
  return "USER";
}

export function actionConfig(action: string): ActionConfig {
  return ACTION_CONFIG[action] ?? { category: inferCategory(action), saveToAuditLog: false };
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function diffFields(beforeData: unknown, afterData: unknown) {
  if (!beforeData || !afterData || typeof beforeData !== "object" || typeof afterData !== "object") return [];
  const before = beforeData as Record<string, unknown>;
  const after = afterData as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function writeActivityLog(params: {
  actorUserId: string;
  actorName?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  changedFields?: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
  saveToAuditLog?: boolean;
}) {
  const config = actionConfig(params.action);
  const category = config.category;

  await prisma.auditLog.create({
    data: {
      userId: params.actorUserId,
      action: params.action,
      category,
      entity: params.targetType,
      entityId: params.targetId ?? undefined,
      detail: params.detail ?? undefined,
    },
  });

  const shouldSaveSystemAudit = params.saveToAuditLog ?? config.saveToAuditLog;
  if (!shouldSaveSystemAudit) return;

  const actorName =
    params.actorName ??
    (await prisma.user.findUnique({ where: { id: params.actorUserId }, select: { name: true } }).then((user) => user?.name).catch(() => null)) ??
    "Không xác định";

  await prisma.systemAuditLog.create({
    data: {
      actorUserId: params.actorUserId,
      actorName,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      beforeData: jsonOrNull(params.beforeData),
      afterData: jsonOrNull(params.afterData),
      changedFields: params.changedFields ?? diffFields(params.beforeData, params.afterData),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

export function requestAuditMeta(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent"),
  };
}
