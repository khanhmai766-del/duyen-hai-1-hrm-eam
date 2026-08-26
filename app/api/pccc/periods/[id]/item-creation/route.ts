import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION } from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

// POST /api/pccc/periods/<id>/item-creation { enabled }
// Công tắc chỉ dành cho cấp quản lý và được lưu theo kỳ để kỳ mới luôn trở về trạng
// thái khoá an toàn, không vô tình kế thừa cửa thêm thiết bị của tháng trước.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      PCCC_PERMISSION.controlItemCreation,
      ["manage", "full"],
      "Không đủ quyền bật hoặc tắt chức năng thêm thiết bị PCCC"
    );
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") return fail("Trạng thái công tắc không hợp lệ");

    const current = await prisma.pcccPeriod.findUnique({ where: { id: params.id } });
    if (!current) return fail("Không tìm thấy kỳ kiểm tra PCCC", 404);
    if (current.isClosed) return fail("Kỳ đã chốt, không thể thay đổi cấu hình thêm thiết bị", 409);

    const updated = await prisma.pcccPeriod.update({
      where: { id: current.id },
      data: { allowItemCreation: body.enabled },
    });
    await audit(
      user.id,
      body.enabled ? "ENABLE_PCCC_ITEM_CREATION" : "DISABLE_PCCC_ITEM_CREATION",
      "PcccPeriod",
      current.id,
      auditDetailWithPosition(
        user,
        `${body.enabled ? "Mở" : "Khoá"} chức năng thêm thiết bị · ${current.label}`
      ),
      { beforeData: current, afterData: updated }
    );
    return ok(updated);
  });
}
