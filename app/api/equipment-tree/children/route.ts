import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, requireUser } from "@/lib/api";
import { assertSeqViewable, equipmentSeqWhere, resolveEquipmentTreeAccess } from "@/lib/server-access";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScopeParam, seqInScope } from "@/lib/equipment-units";
import { TREE_SELECT, toTreeNode } from "@/lib/equipment-tree-lazy";

export const dynamic = "force-dynamic";

// Cây LAZY: khi bung 1 nút, chỉ trả CON TRỰC TIẾP của nút đó (không tải cả nhánh).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const parentSeq = (req.nextUrl.searchParams.get("parentSeq") ?? "").trim();
    if (!parentSeq) return fail("Thiếu parentSeq");
    const scope = parseScopeParam(req.nextUrl.searchParams.get("scope"));
    // Chặn bung nhánh của phạm vi khác (vd mở nhánh dùng chung từ cây tổ máy S2).
    if (scope && !seqInScope(parentSeq, scope)) return fail("Thiết bị không thuộc phạm vi cây đang xem");
    await assertSeqViewable(user, parentSeq);

    const { filter } = await resolveEquipmentTreeAccess(user);
    const seqWhere = equipmentSeqWhere(filter, "seq");
    const where = seqWhere ? { AND: [{ parentSeq }, seqWhere] } : { parentSeq };

    const [nodes, overrideOf] = await Promise.all([
      prisma.equipmentNode.findMany({ where, select: TREE_SELECT, orderBy: { sort: "asc" } }),
      getProfileOverrides(scope ?? "S1"),
    ]);
    return ok(nodes.map((n) => toTreeNode(n, scope ?? "S1", overrideOf(n.seq))));
  });
}
