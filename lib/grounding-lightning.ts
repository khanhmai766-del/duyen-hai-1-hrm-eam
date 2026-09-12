import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizePosition } from "@/lib/pccc-position";
import { isUnrestrictedEquipmentPosition } from "@/lib/position-system-scopes";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { s3ProxyUrl } from "@/lib/s3";
import {
  GROUNDING_STATUSES,
  GROUNDING_TYPES,
  type GroundingStatus,
  type GroundingType,
} from "@/lib/grounding-lightning-shared";

export {
  GROUNDING_STATUSES,
  GROUNDING_STATUS_LABEL,
  GROUNDING_TYPES,
  GROUNDING_TYPE_LABEL,
} from "@/lib/grounding-lightning-shared";
export type {
  GroundingStatus,
  GroundingType,
} from "@/lib/grounding-lightning-shared";
export const GROUNDING_PERMISSIONS = {
  view: "grounding-lightning-view",
  manage: "grounding-lightning-manage",
  catalog: "grounding-lightning-catalog",
  delete: "grounding-lightning-delete",
} as const;

export type GroundingUser = {
  id?: string;
  role?: string;
  accessMode?: string;
  position?: string | null;
  primaryPosition?: string | null;
  currentPosition?: string | null;
};

export function isGroundingType(value: unknown): value is GroundingType {
  return (
    typeof value === "string" &&
    (GROUNDING_TYPES as readonly string[]).includes(value)
  );
}
export function isGroundingStatus(value: unknown): value is GroundingStatus {
  return (
    typeof value === "string" &&
    (GROUNDING_STATUSES as readonly string[]).includes(value)
  );
}
export function isGroundingMachine(
  value: unknown,
): value is "S1" | "S2" | "COMMON" {
  return value === "S1" || value === "S2" || value === "COMMON";
}

export function groundingScope(user: GroundingUser) {
  const position =
    user.currentPosition ?? user.primaryPosition ?? user.position;
  // Cấp quản lý theo vai trò hoặc cương vị được xem toàn bộ. Kiểm tra cả cương vị
  // chính để không bị thu hẹp khi họ đang chọn một cương vị kiêm nhiệm để làm việc.
  const managementPositions = [
    user.currentPosition,
    user.primaryPosition ?? user.position,
  ];
  if (
    ["ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role ?? "") ||
    managementPositions.some((value) => isUnrestrictedEquipmentPosition(value))
  ) {
    return { all: true as const, positionCode: null };
  }
  return {
    all: false as const,
    positionCode: normalizePosition(position).code,
  };
}

/** Mức manage/full được cấp thêm cũng mở phạm vi toàn bộ, không phụ thuộc vai trò. */
export async function groundingScopeWithPermissions(user: GroundingUser) {
  const base = groundingScope(user);
  if (base.all) return base;
  const elevated = await Promise.all(
    Object.values(GROUNDING_PERMISSIONS).map((permissionId) =>
      hasPermissionLevel(user, permissionId, ["manage", "full"]),
    ),
  );
  return elevated.some(Boolean)
    ? { all: true as const, positionCode: null }
    : base;
}

export async function assertGroundingScope(
  user: GroundingUser,
  item: { positionCode?: string | null },
) {
  const scope = await groundingScopeWithPermissions(user);
  if (
    !scope.all &&
    (!scope.positionCode || scope.positionCode !== item.positionCode)
  ) {
    throw fail("Không được thao tác dữ liệu ngoài cương vị đang làm việc", 403);
  }
}

/** Đổi S3 key ảnh khiếm khuyết thành URL proxy và xác định dòng đã thay đổi kể từ lần xác nhận gần nhất. */
/**
 * Ảnh đại diện của những người đã xác nhận, tra theo `inspectedById`.
 *
 * KHÔNG lấy được từ phiên đăng nhập: `avatarUrl` cố ý nằm ngoài JWT (ảnh base64 vài chục
 * KB sẽ làm tràn cookie phiên — xem lib/auth.ts), mà đây lại là avatar của NGƯỜI KHÁC chứ
 * không phải người đang xem. Bảng có vài trăm dòng nhưng chỉ vài chục người ký, nên gom
 * id lại hỏi MỘT lượt thay vì kèm `include` vào từng dòng.
 */
export async function groundingInspectorAvatars(items: any[]) {
  const ids = Array.from(
    new Set(
      items
        .map((item) => item.inspections?.[0]?.inspectedById)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (ids.length === 0) return new Map<string, string | null>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, avatarUrl: true },
  });
  return new Map(users.map((user) => [user.id, user.avatarUrl]));
}

export function serializeGroundingItem(
  item: any,
  avatars?: Map<string, string | null>,
) {
  const latestInspection = item.inspections?.[0] ?? null;
  const timestamps = [
    new Date(item.updatedAt).getTime(),
    ...(item.points ?? []).map((point: any) =>
      new Date(point.updatedAt).getTime(),
    ),
    ...(item.points ?? []).flatMap((point: any) =>
      (point.attachments ?? []).map((attachment: any) =>
        new Date(attachment.createdAt).getTime(),
      ),
    ),
  ];
  const { inspections: _inspections, ...rest } = item;
  return {
    ...rest,
    points: (item.points ?? []).map((point: any) => ({
      ...point,
      attachments: (point.attachments ?? []).map((attachment: any) => ({
        ...attachment,
        url: s3ProxyUrl(
          attachment.s3Key,
          attachment.originalName ?? "anh-kiem-tra.webp",
        ),
      })),
    })),
    latestInspection: latestInspection
      ? {
          ...latestInspection,
          inspectorAvatarUrl:
            avatars?.get(latestInspection.inspectedById) ?? null,
        }
      : null,
    needsSignature:
      !latestInspection ||
      new Date(latestInspection.signedAt).getTime() < Math.max(...timestamps),
  };
}
