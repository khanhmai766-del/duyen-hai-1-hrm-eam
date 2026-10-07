import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  GROUNDING_PERMISSIONS,
  assertGroundingScope,
} from "@/lib/grounding-lightning";

import { s3ProxyUrl } from "@/lib/s3";
import { groundingRetentionWindow } from "@/lib/grounding-retention";
import { runGroundingRetention } from "@/lib/server/grounding-retention";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, GROUNDING_PERMISSIONS.view, [
      "read",
      "personal",
      "manage",
      "full",
    ]);
    const item = await prisma.groundingLightningItem.findUnique({
      where: { id: params.id },
    });
    if (!item) return fail("Không tìm thấy khu vực/thiết bị", 404);
    await assertGroundingScope(user, item);
    const now = new Date();
    await runGroundingRetention(prisma, now);
    const rows = await prisma.groundingLightningInspection.findMany({
      where: { itemId: item.id, signedAt: { gte: groundingRetentionWindow(now).cutoff } },
      include: { results: { orderBy: { type: "asc" } } },
      orderBy: { signedAt: "desc" },
      take: 50,
    });
    return ok(rows.map((row) => ({ ...row, results: row.results.map((result) => ({
      ...result, imageUrls: result.imageKeys.map((key) => s3ProxyUrl(key, "anh-kiem-tra.webp")),
    })) })));
  });
}
