import { fail } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { positionsMatch } from "@/lib/position-catalog";
import { CHEMICAL_PERMISSION_ID } from "./constants";

/**
 * Quyền của module Tồn kho hóa chất.
 *
 * Bốn mức (lib/rbac-permissions.ts):
 *   read     — xem, xuất báo cáo
 *   personal — ghi nhật ký ngày, tạo/sửa phiếu nhập, sửa ô tồn cuối ĐÚNG cương vị đang trực
 *   manage   — thêm: sản lượng S1+S2, xóa phiếu, mở/khóa kỳ, hợp đồng, xem trước import
 *   full     — thêm: ghi import, mở khóa kỳ
 */

export const READ_LEVELS = ["read", "personal", "manage", "full"] as const;
export const WRITE_LEVELS = ["personal", "manage", "full"] as const;
export const MANAGE_LEVELS = ["manage", "full"] as const;
export const FULL_LEVELS = ["full"] as const;

type SessionUser = {
  id?: string;
  role?: string;
  accessMode?: string;
  position?: string | null;
  currentPosition?: string | null;
};

export async function canRead(user: SessionUser) {
  return hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, [...READ_LEVELS]);
}

export async function canWrite(user: SessionUser) {
  return hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, [...WRITE_LEVELS]);
}

export async function canManage(user: SessionUser) {
  return hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS]);
}

export async function canImport(user: SessionUser) {
  return hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, [...FULL_LEVELS]);
}

/**
 * Cương vị đang trực của người dùng.
 * Ưu tiên `currentPosition`, chỉ lùi về `position` khi chưa nhận ca.
 */
export function actingPosition(user: SessionUser): string | null {
  return user.currentPosition ?? user.position ?? null;
}

/**
 * Mức `personal` chỉ được sửa ô của đúng cương vị đang trực; `manage` trở lên sửa
 * mọi cương vị. So khớp bằng positionsMatch() chứ không so chuỗi thô — cùng một
 * cương vị có nhiều cách viết trong hệ thống.
 */
export function assertPositionScope(
  user: SessionUser,
  positionCode: string,
  level: "personal" | "manage" | "full"
) {
  if (level !== "personal") return;
  const acting = actingPosition(user);
  if (!acting) {
    throw fail("Tài khoản chưa gắn cương vị nên chưa nhập được số liệu tồn kho", 403);
  }
  if (!positionsMatch(acting, positionCode)) {
    throw fail(`Chỉ được nhập số liệu của cương vị đang trực (${acting})`, 403);
  }
}

/** Mức quyền cao nhất người dùng đang có — giao diện dùng để ẩn/mở thao tác. */
export async function effectiveLevel(user: SessionUser): Promise<"none" | "read" | "personal" | "manage" | "full"> {
  if (await hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, ["full"])) return "full";
  if (await hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, ["manage"])) return "manage";
  if (await hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, ["personal"])) return "personal";
  if (await hasPermissionLevel(user, CHEMICAL_PERMISSION_ID, ["read"])) return "read";
  return "none";
}
