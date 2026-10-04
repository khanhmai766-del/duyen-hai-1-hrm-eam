import { fail } from "@/lib/api";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { PERMIT_ISSUE_PERMISSION, PERMIT_EXECUTE_PERMISSION } from "@/lib/work-permit-permissions";
import { isPermitIssuer, PERMIT_ISSUER_DENIED, type PermitIssuerCandidate } from "@/lib/work-permit-issuers";
import { positionCodeOf } from "@/lib/position-catalog";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
type PermitUser = PermitIssuerCandidate & { id?: string; role?: string; accessMode?: string };
const writeLevels = ["personal", "manage", "full"] as const;

/** Nhóm cố định được cấp phiếu mới / hủy phiếu (lib/work-permit-issuers.ts). */
function issuer(user: PermitUser) {
  return user.accessMode !== "DEFECT_READ_ONLY" && isPermitIssuer(user);
}

/**
 * `canIssueNew`: cấp phiếu mới, lấy số, hủy phiếu — chỉ nhóm cố định.
 * `canIssue`: sửa thông tin phiếu, danh bạ nhà thầu, biện pháp an toàn — nhóm cố định HOẶC quyền RBAC "Cấp phiếu".
 */
export async function permitCapabilities(user: PermitUser) {
  const canIssueNew = issuer(user);
  const [rbacIssue, canExecute] = await Promise.all([
    canIssueNew ? Promise.resolve(true) : hasPermissionLevel(user, PERMIT_ISSUE_PERMISSION, [...writeLevels]),
    hasPermissionLevel(user, PERMIT_EXECUTE_PERMISSION, [...writeLevels]),
  ]);
  return { canIssue: canIssueNew || rbacIssue, canIssueNew, canExecute };
}
export async function requirePermitIssue(user: PermitUser) {
  if (issuer(user)) return;
  await requirePermissionLevel(user, PERMIT_ISSUE_PERMISSION, [...writeLevels], "Bạn không có quyền cấp hoặc chỉnh sửa phiếu công tác");
}
/** Cấp phiếu mới / lấy số / hủy phiếu — chặt theo nhóm cố định, không nới theo RBAC. */
export function requirePermitIssuer(user: PermitUser) {
  if (!issuer(user)) throw fail(PERMIT_ISSUER_DENIED, 403);
}
export function requirePermitExecute(user: PermitUser) {
  return requirePermissionLevel(user, PERMIT_EXECUTE_PERMISSION, [...writeLevels], "Bạn không có quyền thực hiện phiếu công tác");
}

/*
 * QUYỀN THEO TỪNG PHIẾU (nghiệp vụ chốt 04/10/2026) — các nút trong hộp chi tiết PCT:
 *   - Hủy PCT (phiếu đã cấp): chỉ vai trò Quản trị. Hủy NHÁP vẫn theo nhóm cấp phiếu.
 *   - Chỉnh sửa / cấp phiếu: nhóm cấp phiếu cố định (Quản trị, Quản lý, KTV, Trưởng ca, Trưởng kíp).
 *   - Xem và in · Phụ lục · Bổ sung hạng mục · Cập nhật tiến độ: nhóm trên + người ĐỨNG ĐÚNG cương vị
 *     của phiếu (cương vị đang làm việc). Phiếu chung (để trống cương vị) không có người đứng phiếu.
 */
type PermitActorUser = PermitUser & { currentPosition?: string | null };

/** Cương vị đang làm việc của người dùng trùng cương vị ghi trên phiếu (so theo mã danh mục, bỏ hậu tố tổ máy). */
export function holdsPermitPosition(user: PermitActorUser, permitPosition: string | null | undefined) {
  const target = String(permitPosition ?? "").trim();
  const active = String(user.currentPosition ?? user.primaryPosition ?? user.position ?? "").trim();
  if (!target || !active) return false;
  const [a, b] = [positionCodeOf(active), positionCodeOf(target)];
  return a && b ? a === b : normalizeText(active) === normalizeText(target);
}

export function permitRowCapabilities(user: PermitActorUser, permit: { position: string | null }) {
  const writable = user.accessMode !== "DEFECT_READ_ONLY";
  const group = issuer(user);
  return {
    canCancelPermit: writable && user.role === "ADMIN",
    canEditPermit: group,
    canActOnPermit: group || (writable && holdsPermitPosition(user, permit.position)),
  };
}

export const PERMIT_ACTOR_DENIED = "Chỉ người đứng cương vị của phiếu, Quản trị, Quản lý, Kỹ thuật viên, Trưởng ca và Trưởng kíp được thao tác trên phiếu này";

/** Xem và in / Phụ lục / Bổ sung hạng mục / Cập nhật tiến độ. Gọi SAU requirePermitVisible. */
export async function requirePermitActor(user: PermitActorUser, permitId: string) {
  const row = await prisma.workPermit.findUnique({ where: { id: permitId }, select: { position: true } });
  if (!row) throw fail("Không tìm thấy PCT", 404);
  if (!permitRowCapabilities(user, row).canActOnPermit) throw fail(PERMIT_ACTOR_DENIED, 403);
}
