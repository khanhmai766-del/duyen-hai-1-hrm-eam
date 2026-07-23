import { prisma } from "@/lib/prisma";
import { ok, handle, requireUser } from "@/lib/api";
import { resolveEquipmentTreeAccess } from "@/lib/server-access";
import { TREE_SELECT, toTreeNode } from "@/lib/equipment-tree-lazy";

export const dynamic = "force-dynamic";

// Cây LAZY: chỉ trả các nhánh GỐC khi mở trang. Trường nhẹ + hasChildren (từ childCount
// denormalize) — không phụ thuộc tổng số node.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const { rootSeqs } = await resolveEquipmentTreeAccess(user);
    const where = rootSeqs === null ? { parentSeq: null } : { seq: { in: rootSeqs } };
    const nodes = await prisma.equipmentNode.findMany({
      where,
      select: TREE_SELECT,
      orderBy: { sort: "asc" },
    });
    return ok(nodes.map(toTreeNode));
  });
}
