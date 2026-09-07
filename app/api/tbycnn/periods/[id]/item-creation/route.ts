import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { TBYCNN_PERMISSION } from "@/lib/tbycnn-service";

export const dynamic = "force-dynamic";

// POST /api/tbycnn/periods/<id>/item-creation { enabled }
//
// Cùng khuôn với route PCCC cùng tên: công tắc chỉ dành cho cấp quản lý và lưu THEO KỲ
// để kỳ mới luôn trở về trạng thái khoá, không vô tình kế thừa cửa thêm thiết bị của
// tháng trước.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.controlItemCreation,
      ["manage", "full"],
      "Không đủ quyền bật hoặc tắt chức năng thêm thiết bị YCNN"
    );
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") return fail("Trạng thái công tắc không hợp lệ");

    const current = await prisma.tbycnnPeriod.findUnique({ where: { id: params.id } });
    if (!current) return fail("Không tìm thấy kỳ của sổ thiết bị yêu cầu nghiêm ngặt", 404);
    if (current.isClosed) return fail("Kỳ đã chốt, không thể thay đổi cấu hình thêm thiết bị", 409);

    const updated = await prisma.tbycnnPeriod.update({
      where: { id: current.id },
      data: { allowItemCreation: body.enabled },
    });
    await audit(
      user.id,
      body.enabled ? "ENABLE_TBYCNN_ITEM_CREATION" : "DISABLE_TBYCNN_ITEM_CREATION",
      "TbycnnPeriod",
      current.id,
      auditDetailWithPosition(
        user,
        `${body.enabled ? "Mở" : "Khoá"} chức năng thêm thiết bị · kỳ ${current.label}`
      ),
      { beforeData: current, afterData: updated }
    );
    return ok(updated);
  });
}
