import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string; historyId: string } }) {
  return permitHandle(async () => {
    await requireUser();
    const row = await prisma.workPermitHistory.findFirst({ where: { id: params.historyId, permitId: params.id }, select: { id: true, actorName: true, action: true, createdAt: true, before: true, after: true } });
    return row ? ok(row) : fail("Không tìm thấy cập nhật của phiếu này", 404);
  });
}
