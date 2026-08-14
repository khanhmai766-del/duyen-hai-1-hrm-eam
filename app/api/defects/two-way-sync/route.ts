import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  getDefectSyncTrafficMetrics,
  getDefectTwoWaySyncSetting,
  getReusableCancelledDefectNumbers,
  setDefectTwoWaySyncSetting,
  type DefectSyncSettingKey,
} from "@/lib/defect-two-way-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const [setting, metrics, reusableRequestNumbers] = await Promise.all([
      getDefectTwoWaySyncSetting(),
      getDefectSyncTrafficMetrics(),
      getReusableCancelledDefectNumbers(),
    ]);
    return ok({ ...setting, metrics, reusableRequestNumbers });
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
        if (processing > 0 && !["resume", "discard"].includes(body?.pendingAction)) {
          throw fail(
            `Còn ${processing} lô đang xử lý; cần chọn thu hồi để gửi tiếp hoặc bỏ hàng đợi cũ`,
            409
          );
        }
        if ((queued > 0 || processing > 0) && !["resume", "discard"].includes(body?.pendingAction)) {
          throw fail(`Còn ${queued} thay đổi cũ chưa gửi; cần chọn tiếp tục gửi hoặc bỏ hàng đợi cũ`, 409);
        }
        const reclaimed = body.pendingAction === "resume"
          ? await tx.defectSyncOutbox.updateMany({
              where: { ...eventWhere, status: { in: ["PROCESSING", "FAILED"] } },
              data: {
                status: "PENDING",
                claimedAt: null,
                nextAttemptAt: new Date(),
                lastError: "Quản trị viên đưa về hàng chờ để tiếp tục gửi",
              },
            })
          : { count: 0 };
        const deleted = body.pendingAction === "discard"
          ? await tx.defectSyncOutbox.deleteMany({
              where: { ...eventWhere, status: { in: ["PENDING", "FAILED", "PROCESSING"] } },
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
        return { setting: updated, discardedCount: deleted.count, reclaimedCount: reclaimed.count };
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

    const [metrics, reusableRequestNumbers] = await Promise.all([
      getDefectSyncTrafficMetrics(),
      getReusableCancelledDefectNumbers(),
    ]);
    return ok({ ...setting, discardedCount, metrics, reusableRequestNumbers });
  });
}
