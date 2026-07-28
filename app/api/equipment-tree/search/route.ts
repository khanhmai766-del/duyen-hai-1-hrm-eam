import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, handle, requireUser } from "@/lib/api";
import { equipmentSeqWhere, resolveEquipmentTreeAccess } from "@/lib/server-access";
import { scopeSearchTerms, scopeSeqWhere } from "@/lib/equipment-tree-scope";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScopeParam } from "@/lib/equipment-units";
import { toTreeNode } from "@/lib/equipment-tree-lazy";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Tìm kiếm PHÍA SERVER + phân trang (cursor theo sort). Tránh tải/duyệt toàn bộ cây ở client.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").trim();
    const scope = parseScopeParam(sp.get("scope"));
    const cursor = Number(sp.get("cursor")) || 0; // giá trị sort của item cuối trang trước
    if (q.length < 2) return ok([], { nextCursor: null });

    const { filter } = await resolveEquipmentTreeAccess(user);
    const seqWhere = equipmentSeqWhere(filter, "seq");
    // Tìm không dấu trên cột searchText (đã chuẩn hóa lúc import: bỏ dấu + lowercase).
    // Ở cây S2, KKS người dùng gõ ("20HFE…") được dịch ngược về dạng S1 đang lưu.
    const terms = scopeSearchTerms(q, scope ?? "S1");
    const and: Record<string, unknown>[] = [
      terms.length > 1
        ? { OR: terms.map((term) => ({ searchText: { contains: term } })) }
        : { searchText: { contains: terms[0] } },
    ];
    if (scope) and.push(scopeSeqWhere(scope, "seq"));
    if (seqWhere) and.push(seqWhere);
    if (cursor) and.push({ sort: { gt: cursor } });

    const [rows, overrideOf] = await Promise.all([
      prisma.equipmentNode.findMany({
        where: { AND: and },
        select: { seq: true, parentSeq: true, code: true, name: true, kks: true, depth: true, childCount: true, sort: true },
        orderBy: { sort: "asc" },
        take: PAGE_SIZE + 1, // lấy dư 1 để biết còn trang sau
      }),
      getProfileOverrides(scope ?? "S1"),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? page[page.length - 1].sort : null;
    return ok(page.map((n) => toTreeNode(n, scope ?? "S1", overrideOf(n.seq))), { nextCursor });
  });
}
