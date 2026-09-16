import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle, permitSnapshot } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

/** Hủy nháp là thao tác vòng đời riêng, không phụ thuộc dữ liệu biểu mẫu còn thiếu. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (body.version !== before.version) throw fail("Phiếu đã được người khác cập nhật. Đóng cửa sổ và tải lại trước khi hủy.", 409);
      if (before.status !== "DRAFT") throw fail("Chỉ PCT nháp mới được hủy nhanh mà không cần bổ sung thông tin.", 409);
      const saved = await tx.workPermit.updateMany({
        where: { id: before.id, version: before.version, status: "DRAFT" },
        data: { status: "CANCELLED", statusReason: before.statusReason.trim() || "Hủy phiếu nháp", version: { increment: 1 } },
      });
      if (saved.count !== 1) throw fail("Phiếu vừa được cập nhật ở phiên khác. Vui lòng tải lại.", 409);
      const after = await tx.workPermit.findUniqueOrThrow({ where: { id: before.id } });
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: "Hủy phiếu nháp", before: permitSnapshot(before), after: permitSnapshot(after) } });
      return after;
    });
    await audit(user.id, "CANCEL_DRAFT_WORK_PERMIT", "WorkPermit", row.id, `Hủy PCT nháp ${row.number || row.id}`);
    return ok(row);
  });
}
