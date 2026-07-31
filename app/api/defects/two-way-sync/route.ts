import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  getDefectSyncTrafficMetrics,
  getDefectTwoWaySyncSetting,
  setDefectTwoWaySyncSetting,
  type DefectSyncSettingKey,
} from "@/lib/defect-two-way-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const [setting, metrics] = await Promise.all([
      getDefectTwoWaySyncSetting(),
      getDefectSyncTrafficMetrics(),
    ]);
    return ok({ ...setting, metrics });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-two-way-sync", ["full"], "Không đủ quyền bật/tắt đồng bộ hai chiều");

    const body = await req.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") return fail("Thiếu trạng thái bật/tắt");
    const allowedKeys: DefectSyncSettingKey[] = [
      "twoWaySyncEnabled",
      "operationUpdateEnabled",
      "websiteCreateEnabled",
      "websiteRemindEnabled",
    ];
    if (!allowedKeys.includes(body?.key)) return fail("Tính năng đồng bộ không hợp lệ");

    let discardedCount = 0;
    let setting;
    const eventTypeByKey = {
      operationUpdateEnabled: "UPDATE",
      websiteCreateEnabled: "CREATE",
      websiteRemindEnabled: "REMIND",
    } as const;
    const queueEventType = body.key === "twoWaySyncEnabled"
      ? undefined
      : eventTypeByKey[body.key as keyof typeof eventTypeByKey];
    const enablingQueue = body.enabled
      && (body.key === "twoWaySyncEnabled" || Boolean(queueEventType));
    if (enablingQueue) {
      const result = await prisma.$transaction(async (tx) => {
        const eventWhere = queueEventType ? { eventType: queueEventType } : {};
        const [processing, queued] = await Promise.all([
          tx.defectSyncOutbox.count({ where: { ...eventWhere, status: "PROCESSING" } }),
          tx.defectSyncOutbox.count({ where: { ...eventWhere, status: { in: ["PENDING", "FAILED"] } } }),
        ]);
        if (processing > 0) {
          throw fail(
            `Còn ${processing} lô đang xử lý. Vui lòng chờ workflow kết thúc hoặc hết thời gian giữ khóa rồi bật lại`,
            409
          );
        }
        if (queued > 0 && !["resume", "discard"].includes(body?.pendingAction)) {
          throw fail(`Còn ${queued} thay đổi cũ chưa gửi; cần chọn tiếp tục gửi hoặc bỏ hàng đợi cũ`, 409);
        }
        const deleted = body.pendingAction === "discard"
          ? await tx.defectSyncOutbox.deleteMany({
              where: { ...eventWhere, status: { in: ["PENDING", "FAILED"] } },
            })
          : { count: 0 };
        const updated = await tx.defectSyncSetting.upsert({
          where: { id: "singleton" },
          create: {
            id: "singleton",
            [body.key]: true,
            updatedById: user.id,
            updatedByName: user.name,
          },
          update: {
            [body.key]: true,
            updatedById: user.id,
            updatedByName: user.name,
          },
        });
        return { setting: updated, discardedCount: deleted.count };
      });
      setting = result.setting;
      discardedCount = result.discardedCount;
    } else {
      setting = await setDefectTwoWaySyncSetting({
        key: body.key,
        enabled: body.enabled,
        updatedBy: { id: user.id, name: user.name },
      });
    }

    await audit(
      user.id,
      "SET_DEFECT_TWO_WAY_SYNC",
      "DefectSyncSetting",
      undefined,
      auditDetailWithPosition(
        user,
        `${body.enabled ? "Bật" : "Tắt"} ${body.key}`
        + (discardedCount ? `; bỏ ${discardedCount} sự kiện cũ trong hàng đợi` : "")
      )
    );

    return ok({ ...setting, discardedCount, metrics: await getDefectSyncTrafficMetrics() });
  });
}
