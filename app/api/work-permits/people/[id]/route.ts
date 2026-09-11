import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { parsePermitPerson } from "@/lib/server/work-permit-people";
export const dynamic = "force-dynamic";
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req); const data = parsePermitPerson(body);
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermitPerson.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy nhân sự nhà thầu", 404);
      if (body.version !== before.version) throw fail("Hồ sơ đã thay đổi. Vui lòng tải lại danh bạ.", 409);
      if (data.code !== before.code) throw fail("Số thẻ an toàn đã tạo được giữ cố định để nhận diện qua các PCT");
      const live = await tx.workPermitSession.findFirst({ where: { commanderId: before.id, endedAt: null } });
      if (live) throw fail("Người này đang là CHTT của một lần làm việc chưa kết thúc. Kết thúc lần làm việc trước khi đổi hồ sơ.", 409);
      return tx.workPermitPerson.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } });
    });
    await audit(user.id, "UPDATE_WORK_PERMIT_PERSON", "WorkPermitPerson", row.id, `Cập nhật ${row.code}: ${row.name} · ${row.company}; ${row.isActive ? "đang hoạt động" : "ngừng hoạt động"}`);
    return ok(row);
  });
}
