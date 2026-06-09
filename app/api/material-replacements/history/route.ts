import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import type { Prisma } from "@prisma/client";

/** GET /api/material-replacements/history — lịch sử các lần ghi nhận thay thế. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();

    const where: Prisma.MaterialReplacementLogWhereInput = {};
    if (q) {
      where.OR = [
        { note: { contains: q, mode: "insensitive" } },
        { replacement: { is: { location: { contains: q, mode: "insensitive" } } } },
        { replacement: { is: { material: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { material: { is: { code: { contains: q, mode: "insensitive" } } } } } },
      ];
    }

    const logs = await prisma.materialReplacementLog.findMany({
      where,
      orderBy: { replacedAt: "desc" },
      include: {
        doneBy: { select: { id: true, name: true, position: true } },
        replacement: {
          select: {
            location: true,
            system: true,
            intervalMonths: true,
            intervalNote: true,
            material: { select: { id: true, code: true, name: true, unit: true, system: true } },
          },
        },
      },
    });

    return ok(logs, { total: logs.length });
  });
}
