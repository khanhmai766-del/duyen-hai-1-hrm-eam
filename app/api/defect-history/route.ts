import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true } } };

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");
    const unit = searchParams.get("unit");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (system) where.system = system;
    if (unit) where.unit = unit;
    if (from || to) {
      where.performedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
      };
    }

    const history = await prisma.defectHistory.findMany({
      where,
      orderBy: { performedAt: "desc" },
      include: INCLUDE,
    });
    return ok(history, { total: history.length });
  });
}
