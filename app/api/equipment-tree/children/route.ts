import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, requireUser } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScopeParam, seqInScope } from "@/lib/equipment-units";
import { TREE_SELECT, toTreeNode } from "@/lib/equipment-tree-lazy";
import { canBypassEquipmentPositionScope } from "@/lib/material-equipment-access";
import { requireDeviceView } from "@/lib/device-permissions";
import { resolveEquipmentTreeRequestUser } from "@/lib/equipment-tree-request-access";

export const dynamic = "force-dynamic";

// Cây LAZY: khi bung 1 nút, chỉ trả CON TRỰC TIẾP của nút đó (không tải cả nhánh).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    const parentSeq = (req.nextUrl.searchParams.get("parentSeq") ?? "").trim();
    if (!parentSeq) return fail("Thiếu parentSeq");
    const scope = parseScopeParam(req.nextUrl.searchParams.get("scope"));
    const canAccessAllNodes = await canBypassEquipmentPositionScope(
      user,
      req.nextUrl.searchParams.get("permissionScope")
    );
    const requestedTreeUser = await resolveEquipmentTreeRequestUser(
      user,
      req.nextUrl.searchParams.get("positionScope")
    );
    const treeUser = canAccessAllNodes
      ? { ...requestedTreeUser, role: "ADMIN" }
      : requestedTreeUser;
    // Chặn bung nhánh của phạm vi khác (vd mở nhánh dùng chung từ cây tổ máy S2).
    if (scope && !seqInScope(parentSeq, scope)) return fail("Thiết bị không thuộc phạm vi cây đang xem");
    // Phải dùng `visibleSeqs`, không dùng branchFilter: visibleSeqs chứa cả các
    // thư mục tổ tiên làm đường dẫn tới một nhánh con được cấp quyền. branchFilter
    // chỉ chứa node có quyền dữ liệu thực tế nên sẽ làm đứt cây tại thư mục cha
    // có quyền none. Số con trực tiếp của một node nhỏ, vì vậy đọc theo parentSeq
    // rồi lọc bằng Set trong bộ access đã cache vừa đúng quyền vừa tránh câu IN lớn.
    const access = canAccessAllNodes ? null : await resolveEquipmentAccessForUser(treeUser);
    if (access && !access.visibleSeqs.has(parentSeq)) {
      return fail("Cương vị của bạn không có quyền mở nhánh thiết bị này", 403);
    }

    const [nodes, overrideOf] = await Promise.all([
      prisma.equipmentNode.findMany({ where: { parentSeq }, select: TREE_SELECT, orderBy: { sort: "asc" } }),
      getProfileOverrides(scope ?? "S1"),
    ]);
    const visibleNodes = access
      ? nodes.filter((node) => access.visibleSeqs.has(node.seq))
      : nodes;
    return ok(visibleNodes.map((n) => toTreeNode(n, scope ?? "S1", overrideOf(n.seq))));
  });
}
