import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION } from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

// POST /api/pccc/periods/<id>/close -> chốt kỳ (chuyển sang chỉ đọc); gọi lại để mở
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.close, ["manage", "full"], "Không đủ quyền chốt kỳ");

    const period = await prisma.pcccPeriod.findUnique({ where: { id: params.id } });
    if (!period) return fail("Không tìm thấy kỳ", 404);

    const next = !period.isClosed;
    const updated = await prisma.pcccPeriod.update({
      where: { id: period.id },
      data: { isClosed: next, closedAt: next ? new Date() : null, closedById: next ? user.id : null },
    });
    await audit(
      user.id,
      next ? "CLOSE_PCCC_PERIOD" : "REOPEN_PCCC_PERIOD",
      "PcccPeriod",
      period.id,
      auditDetailWithPosition(user, `${next ? "Chốt" : "Mở lại"} kỳ ${period.label}`),
      { saveToAuditLog: true }
    );
    return ok(updated);
  });
}
