import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitCapabilities } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { parseNkvhLinkUpdate } from "@/lib/nkvh-pct";
import { effectivePermitFormat, formatPermitNumber } from "@/lib/work-permits";

export const dynamic = "force-dynamic";
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  return permitHandle(async () => {
    const user = await requireUser();
    const caps = await permitCapabilities(user);
    if (!caps.canIssue && !caps.canExecute) return fail("Bạn không có quyền cập nhật liên kết NKVH", 403);
    const body = await permitBody(req);
    let input: ReturnType<typeof parseNkvhLinkUpdate>;
    try { input = parseNkvhLinkUpdate(body); } catch (e) { return fail(e instanceof Error ? e.message : "Dữ liệu liên kết không hợp lệ"); }
    const { id } = await props.params;
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (["CLOSED", "CANCELLED"].includes(before.status)) throw fail("Phiếu đã đóng hoặc hủy được khóa để giữ lịch sử", 409);
      if (effectivePermitFormat(before) !== "ELECTRONIC") throw fail("Chỉ gắn liên kết NKVH cho PCT điện tử");
      if (before.version !== input.version) throw fail("PCT vừa được cập nhật. Vui lòng tải lại trước khi gắn link.", 409);
      if (before.nkvhPctId === input.nkvhPctId) return before;
      const after = await tx.workPermit.update({ where: { id }, data: { nkvhPctId: input.nkvhPctId, version: { increment: 1 } } });
      await tx.workPermitHistory.create({ data: { permitId: id, actorId: user.id, actorName: user.name ?? "", action: input.nkvhPctId ? "Gắn / thay liên kết NKVH" : "Gỡ liên kết NKVH", before: permitSnapshot(before), after: permitSnapshot(after) } });
      return after;
    });
    await audit(user.id, "UPDATE_WORK_PERMIT_NKVH_LINK", "WorkPermit", id, `Cập nhật liên kết NKVH của PCT ${formatPermitNumber(row)}`);
    return ok(row);
  });
}
