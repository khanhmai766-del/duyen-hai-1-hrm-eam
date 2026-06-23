import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

// Toàn bộ cây danh mục thiết bị (phẳng) — client tự dựng cây từ seq/parentSeq.
export async function GET() {
  return handle(async () => {
    await requireUser();
    const nodes = await prisma.equipmentNode.findMany({
      orderBy: { sort: "asc" },
      select: { seq: true, parentSeq: true, code: true, name: true, kks: true, drawing: true, depth: true },
    });
    return ok(nodes);
  });
}
