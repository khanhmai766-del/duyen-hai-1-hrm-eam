import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { TBYCNN_PERMISSION } from "@/lib/tbycnn-service";

export const dynamic = "force-dynamic";

// POST /api/tbycnn/periods/<id>/item-deletion { enabled }
//
// Cùng khuôn với công tắc "Thêm thiết bị", nhưng quyền HẸP HƠN HẲN: mặc định chỉ Quản trị
// viên bật/tắt được. Bật công tắc là mở đường xoá cả thiết bị GỐC theo hồ sơ nhà máy —
// dòng xoá đi sẽ mất ở kỳ này và mọi kỳ sau (chuyển kỳ chép từ kỳ trước), nên đây phải là
// một hành động có chủ đích của cấp quản trị, không phải một ô tick nằm sẵn trong lúc sửa
// bảng hằng ngày.
//
// Lưu THEO KỲ để kỳ mới luôn trở về trạng thái khoá, không kế thừa cửa mở của tháng trước.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.controlItemDeletion,
      ["manage", "full"],
      "Không đủ quyền bật hoặc tắt chức năng xoá thiết bị YCNN"
    );
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") return fail("Trạng thái công tắc không hợp lệ");

    const current = await prisma.tbycnnPeriod.findUnique({ where: { id: params.id } });
    if (!current) return fail("Không tìm thấy kỳ của sổ thiết bị yêu cầu nghiêm ngặt", 404);
    if (current.isClosed) return fail("Kỳ đã chốt, không thể thay đổi cấu hình xoá thiết bị", 409);

    const updated = await prisma.tbycnnPeriod.update({
      where: { id: current.id },
      data: { allowItemDeletion: body.enabled },
    });
    await audit(
      user.id,
      body.enabled ? "ENABLE_TBYCNN_ITEM_DELETION" : "DISABLE_TBYCNN_ITEM_DELETION",
      "TbycnnPeriod",
      current.id,
      auditDetailWithPosition(
        user,
        `${body.enabled ? "Mở" : "Khoá"} chức năng xoá thiết bị · kỳ ${current.label}`
      ),
      { beforeData: current, afterData: updated }
    );
    return ok(updated);
  });
}
