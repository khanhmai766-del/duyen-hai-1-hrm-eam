import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
import { historySummarySelect } from "@/lib/server/work-permit-selects";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    await requireUser();
    const query = new URL(req.url).searchParams;
    const type = query.get("type"), offset = Number(query.get("offset") ?? 2);
    const version = Number(query.get("version"));
    if (!["sessions", "history"].includes(type ?? "") || !Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(version) || version < 1) return fail("Bộ lọc lịch sử không hợp lệ");
    return prisma.$transaction(async tx => {
      const permit = await tx.workPermit.findUnique({ where: { id: params.id }, select: { version: true } });
      if (!permit) return fail("Không tìm thấy PCT", 404);
      if (permit.version !== version) return fail("Phiếu vừa thay đổi. Vui lòng tải lại chi tiết trước khi xem tiếp.", 409);
      const where = { permitId: params.id };
      const rows = type === "sessions"
        ? await tx.workPermitSession.findMany({ where, orderBy: [{ openedAt: "desc" }, { id: "desc" }], skip: offset, take: 11 })
        : await tx.workPermitHistory.findMany({ where, select: historySummarySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: 11 });
      return ok(rows.slice(0, 10), { nextOffset: rows.length > 10 ? offset + 10 : null });
    }, { isolationLevel: "RepeatableRead" });
  });
}
