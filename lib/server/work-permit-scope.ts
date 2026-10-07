import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { canViewPosition, POSITION_SCOPE_ALL, POSITION_SCOPE_PERMISSION, resolvePositionViewScope, type PositionViewScope } from "@/lib/position-data-scope";
import { POSITION_CATALOG, positionCodeOf, type PositionCode } from "@/lib/position-catalog";
import { blockForPosition } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { hasPermissionLevel } from "@/lib/rbac-guard";

/*
 * PHẠM VI XEM / THAO TÁC PCT THEO CƯƠNG VỊ (nghiệp vụ chốt 27/09/2026).
 *
 * Mỗi PCT có ô "Cương vị". Người dùng chỉ thấy — và vì thế chỉ thao tác được — phiếu thuộc cương vị ĐANG
 * LÀM VIỆC của mình (người kiêm nhiệm: cương vị đang chọn ở trang Tài khoản); chỉ Lò trưởng / Máy trưởng /
 * Trực chính điện thấy thêm cấp dưới — xem `permitScopeOf` (từ 03/10/2026 không còn dùng luật chung của
 * lib/position-data-scope.ts, vốn cho Trưởng kíp xem theo nhánh và cho mọi cương vị xem cấp dưới).
 *
 * Khác các nghiệp vụ kia ở MỘT điểm: phiếu để trống cương vị ("Tất cả cương vị" trên biểu mẫu) là phiếu
 * CHUNG — ai cũng thấy, không chỉ người xem toàn bộ.
 */
export type PermitScopeUser = Parameters<typeof resolvePositionViewScope>[0];

/*
 * Phân cấp RIÊNG của sổ PCT (nghiệp vụ chốt 03/10/2026) — hẹp hơn luật chung ở position-data-scope:
 * - xem tất cả: Quản trị, quyền "work-permit-view" mức manage/full, Trưởng ca, Trưởng kíp (Lò máy + điện),
 *   Quản đốc/Phó QĐ, KTV, Quản lý, Thống kê;
 * - chỉ ba cương vị đầu nhánh được thấy cấp dưới: Lò trưởng → khối Lò hơi, Máy trưởng → khối Turbine,
 *   Trực chính điện → Trực phụ điện;
 * - mọi cương vị khác (Lò phó, Máy phó, Máy nghiền, …) chỉ thấy phiếu của đúng cương vị mình.
 * Cương vị xét là cương vị ĐANG LÀM VIỆC (currentPosition), chưa chọn thì cương vị chính.
 */
const PERMIT_VIEW_ALL_CODES: PositionCode[] = ["SHIFT_SUPERVISOR", "BOILER_TURBINE_SHIFT_LEAD", "ELECTRICAL_SHIFT_LEAD"];
const PERMIT_VIEW_ALL_KEYS = ["quan doc", "ky thuat vien", "quan ly", "thong ke", "truong ca", "truong kip"];
const PERMIT_BRANCH_HEADS: Partial<Record<PositionCode, PositionCode[]>> = {
  BOILER_LEAD: POSITION_CATALOG.filter(item => blockForPosition(item.label) === "Khối Lò Hơi").map(item => item.code),
  TURBINE_LEAD: POSITION_CATALOG.filter(item => blockForPosition(item.label) === "Khối Turbine").map(item => item.code),
  ELECTRICAL_MAIN_OPERATOR: ["ELECTRICAL_MAIN_OPERATOR", "ELECTRICAL_ASSISTANT_OPERATOR"],
};

export async function permitScopeOf(user: PermitScopeUser): Promise<PositionViewScope> {
  if (user.accessMode === "DEFECT_READ_ONLY") {
    if (!await hasPermissionLevel(user, POSITION_SCOPE_PERMISSION.workPermit, ["read"])) throw fail("Tài khoản chưa được cấp quyền xem sổ cấp PCT", 403);
    return POSITION_SCOPE_ALL;
  }
  if (user.role === "ADMIN") return POSITION_SCOPE_ALL;
  if (await hasPermissionLevel(user, POSITION_SCOPE_PERMISSION.workPermit, ["manage", "full"])) return POSITION_SCOPE_ALL;
  const active = String(user.currentPosition ?? user.primaryPosition ?? user.position ?? "").trim();
  if (!active) return { all: false, codes: [] };
  const code = positionCodeOf(active);
  if (code && PERMIT_VIEW_ALL_CODES.includes(code)) return POSITION_SCOPE_ALL;
  const key = normalizeText(active);
  if (PERMIT_VIEW_ALL_KEYS.some(k => key.includes(k))) return POSITION_SCOPE_ALL;
  if (!code) return { all: false, codes: [] };
  return { all: false, codes: PERMIT_BRANCH_HEADS[code] ?? [code] };
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
