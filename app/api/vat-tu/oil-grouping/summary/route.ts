import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import {
  GROUPABLE_CATEGORIES,
  isGroupableCategory,
  type GroupableCategory,
} from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();

    const rows = await prisma.oilType.groupBy({
      by: ["category"],
      where: { category: { in: [...GROUPABLE_CATEGORIES] } },
      _count: { _all: true },
    });

    const groupsByCategory = Object.fromEntries(
      GROUPABLE_CATEGORIES.map((category) => [category, 0])
    ) as Record<GroupableCategory, number>;

    for (const row of rows) {
      if (isGroupableCategory(row.category)) {
        groupsByCategory[row.category] = row._count._all;
      }
    }

    return ok({
      totalGroups: Object.values(groupsByCategory).reduce(
        (total, count) => total + count,
        0
      ),
      categoryCount: GROUPABLE_CATEGORIES.length,
      groupsByCategory,
    });
  });
}
