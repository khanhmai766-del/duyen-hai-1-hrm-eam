import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, handle, requireUser } from "@/lib/api";
import { resolveEquipmentTreeAccess } from "@/lib/server-access";
import { resolveScopeRootWhere } from "@/lib/equipment-tree-scope";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScopeParam } from "@/lib/equipment-units";
import { TREE_SELECT, toTreeNode } from "@/lib/equipment-tree-lazy";

export const dynamic = "force-dynamic";

// Cây LAZY: chỉ trả các nhánh GỐC của PHẠM VI đang xem (S1 / S2 / Dùng chung) khi mở trang.
// Không truyền `scope` → trả gốc của CẢ cây (bộ chọn thư mục khi cấu hình phân quyền).
// Trường nhẹ + hasChildren (từ childCount denormalize) — không phụ thuộc tổng số node.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = parseScopeParam(req.nextUrl.searchParams.get("scope"));
    const [where, overrideOf] = await Promise.all([
      scope
        ? resolveScopeRootWhere(user, scope)
        : resolveEquipmentTreeAccess(user).then(({ rootSeqs }) =>
            rootSeqs === null ? { parentSeq: null } : { seq: { in: rootSeqs } }
          ),
      getProfileOverrides(scope ?? "S1"),
    ]);
    const nodes = await prisma.equipmentNode.findMany({
      where,
      select: TREE_SELECT,
      orderBy: { sort: "asc" },
    });
    return ok(nodes.map((n) => toTreeNode(n, scope ?? "S1", overrideOf(n.seq))));
  });
}
