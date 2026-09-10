import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION } from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

// POST /api/pccc/periods/<id>/item-deletion { enabled }
//
// Cùng khuôn với công tắc "Thêm thiết bị", nhưng quyền HẸP HƠN HẲN: mặc định chỉ Quản trị
// viên bật/tắt được. Sổ PCCC là danh mục theo hồ sơ nhà máy; xoá nhầm một dòng là mất nó ở
// kỳ này và mọi kỳ sau (kỳ mới sinh ra từ kỳ trước), nên mở cửa xoá phải là hành động có
// chủ đích của cấp quản trị chứ không phải một ô tick nằm sẵn lúc sửa bảng hằng ngày.
//
// Lưu THEO KỲ để kỳ mới luôn trở về trạng thái khoá, không kế thừa cửa mở của tháng trước.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      PCCC_PERMISSION.controlItemDeletion,
      ["manage", "full"],
      "Không đủ quyền bật hoặc tắt chức năng xoá thiết bị PCCC"
    );
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") return fail("Trạng thái công tắc không hợp lệ");

    const current = await prisma.pcccPeriod.findUnique({ where: { id: params.id } });
    if (!current) return fail("Không tìm thấy kỳ kiểm tra PCCC", 404);
    if (current.isClosed) return fail("Kỳ đã chốt, không thể thay đổi cấu hình xoá thiết bị", 409);

    const updated = await prisma.pcccPeriod.update({
      where: { id: current.id },
      data: { allowItemDeletion: body.enabled },
    });
    await audit(
      user.id,
      body.enabled ? "ENABLE_PCCC_ITEM_DELETION" : "DISABLE_PCCC_ITEM_DELETION",
      "PcccPeriod",
      current.id,
      auditDetailWithPosition(
        user,
        `${body.enabled ? "Mở" : "Khoá"} chức năng xoá thiết bị · ${current.label}`
      ),
      { beforeData: current, afterData: updated }
    );
    return ok(updated);
  });
}
