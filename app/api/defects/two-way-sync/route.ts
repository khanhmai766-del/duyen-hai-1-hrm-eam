import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { getDefectTwoWaySyncSetting, setDefectTwoWaySyncEnabled } from "@/lib/defect-two-way-sync";

export const dynamic = "force-dynamic";

// Đồng bộ khiếm khuyết hiện tại chỉ một chiều (Google Sheet → DH1). Cờ này là thiết kế
// dự phòng cho giai đoạn ghi ngược sau này, mặc định tắt; chưa có tác vụ nào đọc cờ này
// để thay đổi hành vi đồng bộ thật.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-two-way-sync", ["full"], "Không đủ quyền xem cấu hình đồng bộ hai chiều");
    return ok(await getDefectTwoWaySyncSetting());
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-two-way-sync", ["full"], "Không đủ quyền bật/tắt đồng bộ hai chiều");

    const body = await req.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") return fail("Thiếu trạng thái bật/tắt");

    const setting = await setDefectTwoWaySyncEnabled({
      enabled: body.enabled,
      updatedBy: { id: user.id, name: user.name },
    });

    await audit(
      user.id,
      "SET_DEFECT_TWO_WAY_SYNC",
      "DefectSyncSetting",
      undefined,
      auditDetailWithPosition(user, body.enabled ? "Bật đồng bộ hai chiều (dự phòng)" : "Tắt đồng bộ hai chiều")
    );

    return ok(setting);
  });
}
