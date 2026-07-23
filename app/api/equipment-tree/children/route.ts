import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, requireUser } from "@/lib/api";
import { assertSeqViewable, equipmentSeqWhere, resolveEquipmentTreeAccess } from "@/lib/server-access";
import { TREE_SELECT, toTreeNode } from "@/lib/equipment-tree-lazy";

export const dynamic = "force-dynamic";

// Cây LAZY: khi bung 1 nút, chỉ trả CON TRỰC TIẾP của nút đó (không tải cả nhánh).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const parentSeq = (req.nextUrl.searchParams.get("parentSeq") ?? "").trim();
    if (!parentSeq) return fail("Thiếu parentSeq");
    await assertSeqViewable(user, parentSeq);

    const { filter } = await resolveEquipmentTreeAccess(user);
    const seqWhere = equipmentSeqWhere(filter, "seq");
    const where = seqWhere ? { AND: [{ parentSeq }, seqWhere] } : { parentSeq };

    const nodes = await prisma.equipmentNode.findMany({
      where,
      select: TREE_SELECT,
      orderBy: { sort: "asc" },
    });
    return ok(nodes.map(toTreeNode));
  });
}
