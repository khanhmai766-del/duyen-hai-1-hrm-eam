import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";

/**
 * Các lần ghi "Kết quả công việc" trước đây. Phiếu chỉ có MỘT ô kết quả (lưu lại là ghi đè), nhưng
 * mỗi lần lưu đều để lại before/after trong WorkPermitHistory — nên rút từ đó, không cần bảng mới.
 * Chỉ lấy mục mà kết quả thật sự đổi và khác rỗng; mới nhất trước.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitVisible(user, id);
    const rows = await prisma.$queryRaw<Array<{ id: string; createdAt: Date; actorName: string; result: string }>>`
      SELECT "id", "createdAt", "actorName", "after"->>'result' AS "result"
      FROM "WorkPermitHistory"
      WHERE "permitId" = ${id}
        AND btrim(coalesce("after"->>'result', '')) <> ''
        AND ("after"->>'result') IS DISTINCT FROM ("before"->>'result')
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 50
    `;
    return ok(rows);
  });
}
