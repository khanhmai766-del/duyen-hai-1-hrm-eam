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
      ["manage", "full"],
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
      ["manage", "full"],
      "Không đủ quyền bỏ qua đồng bộ"
    );

    const body = await req.json().catch(() => ({}));
    const eventId = String(body?.eventId ?? "").trim();
    const force = body?.force === true;
    if (!eventId) return fail("Thiếu sự kiện cần bỏ qua");

    // Kiểm tra nghiệp vụ ngoài interactive transaction. Ném NextResponse bên
    // trong callback Prisma có thể bị Prisma bọc lại thành lỗi P2028 và giao
    // diện chỉ nhận “Lỗi máy chủ”, làm mất hướng dẫn cần thiết cho admin.
    const event = await prisma.defectSyncOutbox.findUnique({ where: { id: eventId } });
    if (!event) return fail("Không tìm thấy sự kiện đồng bộ", 404);
    if (event.status === "PROCESSING") {
      if (!force) return fail("Sự kiện đang được n8n xử lý; cần dùng Thu hồi và bỏ qua", 409);
      const setting = await prisma.defectSyncSetting.findUnique({ where: { id: "singleton" } });
      const featureEnabled = Boolean(
        setting?.twoWaySyncEnabled
        && (
          (event.eventType === "UPDATE" && setting.operationUpdateEnabled)
          || (event.eventType === "CREATE" && setting.websiteCreateEnabled)
          || (event.eventType === "REMIND" && setting.websiteRemindEnabled)
        )
      );
      if (featureEnabled) {
        return fail("Hãy tắt loại đồng bộ tương ứng trước khi thu hồi sự kiện đang xử lý", 409);
      }
    }
    const allowedStatuses = force ? ["PENDING", "FAILED", "PROCESSING"] : ["PENDING", "FAILED"];
    if (!allowedStatuses.includes(event.status)) {
      return fail("Sự kiện không còn ở trạng thái có thể bỏ qua", 409);
    }
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload
      : null;
    const cancellation = payload?.cancellation === true;

    const result = await prisma.$transaction(async (tx) => {
      const skippedAt = new Date();
      // Điều kiện trạng thái nằm ngay trong UPDATE để không đua với endpoint
      // claim của n8n. Nếu n8n vừa nhận sự kiện sau lần đọc phía trên, thao tác
      // bỏ qua phải thất bại thay vì đổi PROCESSING thành SKIPPED giữa lúc ghi.
      const skipped = await tx.defectSyncOutbox.updateMany({
        where: { id: event.id, status: { in: allowedStatuses } },
        data: {
          status: "SKIPPED",
          completedAt: skippedAt,
          claimedAt: null,
          nextAttemptAt: skippedAt,
          lastError: force
            ? `Quản trị viên ${user.name} thu hồi và bỏ qua trên website`
            : `Quản trị viên ${user.name} bỏ qua trên website`,
        },
      });
      if (skipped.count !== 1) return null;

      if (cancellation) {
        await tx.defect.updateMany({
          where: { id: event.defectId, cancelledAt: { not: null } },
          // “Bỏ qua” chỉ có nhiệm vụ kết thúc trạng thái chờ. Không chạm các
          // cột kho STT: sự kiện không được Sheet ACK nên số phiếu đương nhiên
          // không đủ điều kiện tái sử dụng. Việc tách này còn giúp admin cứu
          // hàng đợi cũ trên DB chưa kịp áp migration kho số.
          data: { syncState: "CONFIRMED" },
        });
      }
      const updated = await tx.defectSyncOutbox.findUniqueOrThrow({ where: { id: event.id } });
      return { event: updated, cancellation, forced: force && event.status === "PROCESSING" };
    });
    if (!result) return fail("Trạng thái sự kiện vừa thay đổi; vui lòng tải lại hàng đợi", 409);

    await audit(
      user.id,
      "SKIP_DEFECT_SYNC_EVENT",
      "DefectSyncOutbox",
      result.event.id,
      auditDetailWithPosition(
        user,
        `${result.forced ? "Thu hồi và bỏ qua" : "Bỏ qua"} ${result.event.eventType} của phiếu ${result.event.defectId}`
        + (result.cancellation ? "; xác nhận hủy trên website nhưng không trả lại STT" : "")
      )
    );
    return ok(result.event);
  });
}
