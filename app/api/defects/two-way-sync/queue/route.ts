import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const WAITING_STATUSES = ["PENDING", "PROCESSING", "FAILED"];

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "defect-two-way-sync",
      ["full"],
      "Không đủ quyền xem hàng đợi đồng bộ"
    );

    const events = await prisma.defectSyncOutbox.findMany({
      where: { status: { in: WAITING_STATUSES } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        defectId: true,
        eventType: true,
        payload: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        claimedAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return ok(events);
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "defect-two-way-sync",
      ["full"],
      "Không đủ quyền bỏ qua đồng bộ"
    );

    const body = await req.json().catch(() => ({}));
    const eventId = String(body?.eventId ?? "").trim();
    if (!eventId) return fail("Thiếu sự kiện cần bỏ qua");

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.defectSyncOutbox.findUnique({ where: { id: eventId } });
      if (!event) throw fail("Không tìm thấy sự kiện đồng bộ", 404);
      if (event.status === "PROCESSING") {
        throw fail("Sự kiện đang được n8n xử lý, chưa thể bỏ qua", 409);
      }
      if (!["PENDING", "FAILED"].includes(event.status)) {
        throw fail("Sự kiện không còn ở trạng thái có thể bỏ qua", 409);
      }

      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload
        : null;
      const cancellation = payload?.cancellation === true;
      const skippedAt = new Date();
      // Điều kiện trạng thái nằm ngay trong UPDATE để không đua với endpoint
      // claim của n8n. Nếu n8n vừa nhận sự kiện sau lần đọc phía trên, thao tác
      // bỏ qua phải thất bại thay vì đổi PROCESSING thành SKIPPED giữa lúc ghi.
      const skipped = await tx.defectSyncOutbox.updateMany({
        where: { id: event.id, status: { in: ["PENDING", "FAILED"] } },
        data: {
          status: "SKIPPED",
          completedAt: skippedAt,
          claimedAt: null,
          nextAttemptAt: skippedAt,
          lastError: `Quản trị viên ${user.name} bỏ qua trên website`,
        },
      });
      if (skipped.count !== 1) {
        throw fail("Sự kiện vừa được n8n nhận xử lý, chưa thể bỏ qua", 409);
      }

      if (cancellation) {
        await tx.defect.updateMany({
          where: { id: event.defectId, cancelledAt: { not: null } },
          data: {
            syncState: "CONFIRMED",
            requestNumberReuseEligible: false,
            requestNumberReleasedAt: null,
          },
        });
      }
      const updated = await tx.defectSyncOutbox.findUniqueOrThrow({ where: { id: event.id } });
      return { event: updated, cancellation };
    });

    await audit(
      user.id,
      "SKIP_DEFECT_SYNC_EVENT",
      "DefectSyncOutbox",
      result.event.id,
      auditDetailWithPosition(
        user,
        `Bỏ qua ${result.event.eventType} của phiếu ${result.event.defectId}`
        + (result.cancellation ? "; xác nhận hủy trên website nhưng không trả lại STT" : "")
      )
    );
    return ok(result.event);
  });
}
