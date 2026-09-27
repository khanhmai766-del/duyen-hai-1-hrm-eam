import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canViewPosition, resolvePositionViewScope, type PositionViewScope } from "@/lib/position-data-scope";

/*
 * PHẠM VI XEM / THAO TÁC PCT THEO CƯƠNG VỊ (nghiệp vụ chốt 27/09/2026).
 *
 * Mỗi PCT có ô "Cương vị". Người dùng chỉ thấy — và vì thế chỉ thao tác được — phiếu thuộc cương vị ĐANG
 * LÀM VIỆC của mình (người kiêm nhiệm: cương vị đang chọn ở trang Tài khoản) cùng cương vị cấp dưới theo sơ
 * đồ ca trực. Luật lấy nguyên từ lib/position-data-scope.ts (dùng chung với Khiếm khuyết, Vật tư, PCCC):
 * Quản trị, quyền "work-permit-view" mức manage/full, cương vị Quản đốc/Phó QĐ/KTV/Trưởng ca → xem tất cả.
 *
 * Khác các nghiệp vụ kia ở MỘT điểm: phiếu để trống cương vị ("Tất cả cương vị" trên biểu mẫu) là phiếu
 * CHUNG — ai cũng thấy, không chỉ người xem toàn bộ.
 */
export type PermitScopeUser = Parameters<typeof resolvePositionViewScope>[0];

export function permitScopeOf(user: PermitScopeUser) {
  return resolvePositionViewScope(user, "workPermit");
}

export function permitPositionVisible(position: string | null | undefined, scope: PositionViewScope) {
  return !position?.trim() || canViewPosition(position, scope);
}

/**
 * Điều kiện Prisma cho danh sách / xuất Excel / trợ lý AI. Cương vị trên phiếu là chữ tự do, nên lấy các
 * giá trị đang có trong DB (ít, có chỉ mục) rồi lọc bằng đúng hàm của phạm vi — không chép luật sang SQL.
 */
export async function permitPositionWhere(scope: PositionViewScope): Promise<Prisma.WorkPermitWhereInput | null> {
  if (scope.all) return null;
  const rows = await prisma.workPermit.findMany({ distinct: ["position"], select: { position: true } });
  const visible = rows.map(row => row.position).filter(position => position.trim() && canViewPosition(position, scope));
  return { OR: [{ position: "" }, ...(visible.length ? [{ position: { in: visible } }] : [])] };
}

/** Chặn thao tác trên phiếu ngoài phạm vi. Trả 404 như phiếu không tồn tại — không lộ phiếu của cương vị khác. */
export async function requirePermitVisible(user: PermitScopeUser, permitId: string, scope?: PositionViewScope) {
  const row = await prisma.workPermit.findUnique({ where: { id: permitId }, select: { position: true } });
  if (!row) throw fail("Không tìm thấy PCT", 404);
  if (!permitPositionVisible(row.position, scope ?? await permitScopeOf(user))) throw fail("Không tìm thấy PCT", 404);
}

/** Cấp / sửa phiếu: chỉ được ghi cương vị trong phạm vi của mình (hoặc để trống = phiếu chung). */
export async function requirePermitPositionAllowed(user: PermitScopeUser, position: unknown) {
  const value = typeof position === "string" ? position : "";
  if (!value.trim()) return;
  if (!permitPositionVisible(value, await permitScopeOf(user))) throw fail(`Bạn không được cấp hoặc sửa phiếu cho cương vị "${value}"`, 403);
}
