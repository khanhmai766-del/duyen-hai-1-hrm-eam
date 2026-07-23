import { prisma } from "@/lib/prisma";
import { ok, handle } from "@/lib/api";
import { normalizeText } from "@/lib/nav";

export const dynamic = "force-dynamic";

function isDuyenHaiEmployeeId(employeeId?: string | null) {
  return /^nddh\d+$/.test(normalizeText(employeeId ?? ""));
}

// Số liệu công khai cho màn hình đăng nhập (không cần đăng nhập): tổng thiết bị,
// tổng người dùng và số mã vật tư ERP. Chỉ trả về số đếm, không lộ dữ liệu chi tiết.
export async function GET() {
  return handle(async () => {
    const [devices, userRows, materials] = await Promise.all([
      prisma.equipmentNode.count(),
      prisma.user.findMany({ where: { isActive: true }, select: { employeeId: true } }),
      prisma.erpMaterial.count(),
    ]);
    const users = userRows.filter((user) => isDuyenHaiEmployeeId(user.employeeId)).length;
    return ok({ devices, users, materials });
  });
}
