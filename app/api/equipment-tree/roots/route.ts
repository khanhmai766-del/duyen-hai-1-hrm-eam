import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, handle, requireUser } from "@/lib/api";
import { resolveEquipmentAccessForUser, resolveEquipmentTreeAccess } from "@/lib/server-access";
import { resolveScopeRootWhere } from "@/lib/equipment-tree-scope";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScopeParam } from "@/lib/equipment-units";
import { TREE_SELECT, toTreeNode } from "@/lib/equipment-tree-lazy";
import { canBypassEquipmentPositionScope } from "@/lib/material-equipment-access";
import { requireDeviceView } from "@/lib/device-permissions";
import { resolveEquipmentTreeRequestUser } from "@/lib/equipment-tree-request-access";

export const dynamic = "force-dynamic";

// Cây LAZY: chỉ trả các nhánh GỐC của PHẠM VI đang xem (S1 / S2 / Dùng chung) khi mở trang.
// Không truyền `scope` → trả gốc của CẢ cây (bộ chọn thư mục khi cấu hình phân quyền).
// Trường nhẹ + hasChildren (từ childCount denormalize) — không phụ thuộc tổng số node.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
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
    const [where, overrideOf, access] = await Promise.all([
      scope
        ? resolveScopeRootWhere(treeUser, scope)
        : resolveEquipmentTreeAccess(treeUser).then(({ rootSeqs }) =>
            rootSeqs === null ? { parentSeq: null } : { seq: { in: rootSeqs } }
          ),
      getProfileOverrides(scope ?? "S1"),
      canAccessAllNodes ? null : resolveEquipmentAccessForUser(treeUser),
    ]);
    const nodes = await prisma.equipmentNode.findMany({
      where,
      select: TREE_SELECT,
      orderBy: { sort: "asc" },
    });
    // resolveScopeRootWhere có thể bung gốc nhà máy thành các nhánh trực tiếp.
    // Chỉ giữ nhánh nằm trong visibleSeqs; tập này bao gồm cả tổ tiên cần thiết
    // để người dùng đi tới thư mục con được cấp quyền sửa.
    const visibleNodes = access
      ? nodes.filter((node) => access.visibleSeqs.has(node.seq))
      : nodes;
    return ok(visibleNodes.map((n) => toTreeNode(n, scope ?? "S1", overrideOf(n.seq))));
  });
}
