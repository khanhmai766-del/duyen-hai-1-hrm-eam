import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  getDefectSyncTrafficMetrics,
  getDefectTwoWaySyncSetting,
  setDefectTwoWaySyncSetting,
  type DefectSyncSettingKey,
} from "@/lib/defect-two-way-sync";

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

    const setting = await setDefectTwoWaySyncSetting({
      key: body.key,
      enabled: body.enabled,
      updatedBy: { id: user.id, name: user.name },
    });

    await audit(
      user.id,
      "SET_DEFECT_TWO_WAY_SYNC",
      "DefectSyncSetting",
      undefined,
      auditDetailWithPosition(user, `${body.enabled ? "Bật" : "Tắt"} ${body.key}`)
    );

    return ok({ ...setting, metrics: await getDefectSyncTrafficMetrics() });
  });
}
