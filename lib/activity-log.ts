import { Prisma, type ActivityLogCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadS3Object } from "@/lib/s3";

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

const REDACTED_MEDIA_VALUE = "[Dữ liệu hình ảnh đã được lược bỏ khỏi audit]";
const MEDIA_AUDIT_FIELDS = new Set(["avatarurl", "signatureurl"]);

/** Không đưa ảnh/chữ ký base64 vào PostgreSQL hoặc bản sao audit trên S3. */
export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditData);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    MEDIA_AUDIT_FIELDS.has(key.toLowerCase()) && item ? REDACTED_MEDIA_VALUE : sanitizeAuditData(item),
  ]));
}

function diffFields(beforeData: unknown, afterData: unknown) {
  if (!beforeData || !afterData || typeof beforeData !== "object" || typeof afterData !== "object") return [];
  const before = beforeData as Record<string, unknown>;
  const after = afterData as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function auditS3Enabled() {
  return process.env.AUDIT_LOG_S3_ENABLED === "true";
}

function auditS3Prefix() {
  return (process.env.AUDIT_LOG_S3_PREFIX || "audit-logs").replace(/^\/+|\/+$/g, "");
}

function vietnamDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function datePath(date: Date) {
  const { year, month, day } = vietnamDateParts(date);
  return `${year}/${month}/${day}`;
}

async function writeAuditObjectToS3(kind: "activity" | "system", id: string, createdAt: Date, payload: unknown) {
  if (!auditS3Enabled()) return;
  try {
    const time = vietnamDateParts(createdAt);
    // Mỗi part là bất biến để các request đồng thời không đọc/ghi đè cùng một file S3.
    // Script audit:s3:compact sẽ hợp nhất các part thành một file TXT theo ngày.
    const key = `${auditS3Prefix()}/daily/${datePath(createdAt)}/parts/${time.hour}-${time.minute}-${time.second}-${id}-${kind}.txt`;
    await uploadS3Object({
      key,
      body: Buffer.from(`${JSON.stringify(payload)}\n`, "utf8"),
      contentType: "text/plain; charset=utf-8",
      originalName: `${id}-${kind}.txt`,
    });
  } catch (error) {
    console.warn("Không thể lưu audit log lên S3", error);
  }
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

  const activityLog = await prisma.auditLog.create({
    data: {
      userId: params.actorUserId,
      action: params.action,
      category,
      entity: params.targetType,
      entityId: params.targetId ?? undefined,
      detail: params.detail ?? undefined,
    },
  });
  await writeAuditObjectToS3("activity", activityLog.id, activityLog.createdAt, {
    id: activityLog.id,
    kind: "activity",
    actorUserId: params.actorUserId,
    action: params.action,
    category,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    detail: params.detail ?? null,
    createdAt: activityLog.createdAt.toISOString(),
  });

  const shouldSaveSystemAudit = params.saveToAuditLog ?? config.saveToAuditLog;
  if (!shouldSaveSystemAudit) return;

  const actorName =
    params.actorName ??
    (await prisma.user.findUnique({ where: { id: params.actorUserId }, select: { name: true } }).then((user) => user?.name).catch(() => null)) ??
    "Không xác định";
  const changedFields = params.changedFields ?? diffFields(params.beforeData, params.afterData);
  const beforeData = sanitizeAuditData(params.beforeData);
  const afterData = sanitizeAuditData(params.afterData);

  const systemAuditLog = await prisma.systemAuditLog.create({
    data: {
      actorUserId: params.actorUserId,
      actorName,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      beforeData: jsonOrNull(beforeData),
      afterData: jsonOrNull(afterData),
      changedFields,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
  await writeAuditObjectToS3("system", systemAuditLog.id, systemAuditLog.createdAt, {
    id: systemAuditLog.id,
    kind: "system",
    actorUserId: params.actorUserId,
    actorName,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    beforeData: beforeData ?? null,
    afterData: afterData ?? null,
    changedFields: systemAuditLog.changedFields,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    createdAt: systemAuditLog.createdAt.toISOString(),
  });
}

export function requestAuditMeta(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent"),
  };
}
