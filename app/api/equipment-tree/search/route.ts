import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, handle, requireUser } from "@/lib/api";
import { equipmentSeqWhere, resolveEquipmentTreeAccess } from "@/lib/server-access";
import { toTreeNode } from "@/lib/equipment-tree-lazy";
import { normalizeText } from "@/lib/nav";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Tìm kiếm PHÍA SERVER + phân trang (cursor theo sort). Tránh tải/duyệt toàn bộ cây ở client.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").trim();
    const cursor = Number(sp.get("cursor")) || 0; // giá trị sort của item cuối trang trước
    if (q.length < 2) return ok([], { nextCursor: null });

    const { filter } = await resolveEquipmentTreeAccess(user);
    const seqWhere = equipmentSeqWhere(filter, "seq");
    // Tìm không dấu trên cột searchText (đã chuẩn hóa lúc import: bỏ dấu + lowercase).
    const and: Record<string, unknown>[] = [{ searchText: { contains: normalizeText(q) } }];
    if (seqWhere) and.push(seqWhere);
    if (cursor) and.push({ sort: { gt: cursor } });

    const rows = await prisma.equipmentNode.findMany({
      where: { AND: and },
      select: { seq: true, parentSeq: true, code: true, name: true, kks: true, depth: true, childCount: true, sort: true },
      orderBy: { sort: "asc" },
      take: PAGE_SIZE + 1, // lấy dư 1 để biết còn trang sau
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? page[page.length - 1].sort : null;
    return ok(page.map(toTreeNode), { nextCursor });
  });
}
