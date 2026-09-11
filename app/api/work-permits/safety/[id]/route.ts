import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { PERMIT_WRITE_ROLES } from "@/lib/work-permits";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { parseSafetyItem } from "@/lib/server/work-permit-safety";
export const dynamic = "force-dynamic";
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, PERMIT_WRITE_ROLES);
    const body = await permitBody(req), data = parseSafetyItem(body);
    const result = await prisma.$transaction(async tx => {
      const before = await tx.workPermitSafetyMeasure.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy biện pháp an toàn", 404);
      if (before.kind !== data.kind) throw fail("Không đổi loại PCT của biện pháp đã lưu. Hãy tạo biện pháp mới.");
      if (body.version !== before.version) throw fail("Biện pháp vừa được cập nhật. Vui lòng tải lại.", 409);
      const saved = await tx.workPermitSafetyMeasure.updateMany({ where: { id: params.id, version: before.version }, data: { ...data, version: { increment: 1 } } });
      if (!saved.count) throw fail("Biện pháp vừa được cập nhật. Vui lòng tải lại.", 409);
      return { before, after: await tx.workPermitSafetyMeasure.findUniqueOrThrow({ where: { id: params.id } }) };
    });
    await audit(user.id, "UPDATE_PERMIT_SAFETY", "WorkPermitSafetyMeasure", params.id, JSON.stringify(result));
    return ok(result.after);
  });
}
