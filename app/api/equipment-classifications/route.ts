import { handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const rows = await prisma.equipmentBranchClassification.findMany({
      orderBy: { systemSeq: "asc" },
    });
    return ok(rows, { total: rows.length });
  });
}
