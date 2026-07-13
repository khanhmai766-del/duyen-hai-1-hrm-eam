import { prisma } from "@/lib/prisma";
import { ok, handle } from "@/lib/api";
import { normalizeText } from "@/lib/nav";

export const dynamic = "force-dynamic";

const SYNTHETIC_EQUIPMENT_NODE_SEQS = ["1.0", "1.1"];

function isDuyenHaiEmployeeId(employeeId?: string | null) {
  return /^nddh\d+$/.test(normalizeText(employeeId ?? ""));
}

// Số liệu công khai cho màn hình đăng nhập (không cần đăng nhập): tổng thiết bị,
// tổng người dùng và số mã vật tư ERP. Chỉ trả về số đếm, không lộ dữ liệu chi tiết.
export async function GET() {
  return handle(async () => {
    const [equipmentNodes, existingSyntheticNodes, userRows, materials] = await Promise.all([
      prisma.equipmentNode.count(),
      prisma.equipmentNode.count({ where: { seq: { in: SYNTHETIC_EQUIPMENT_NODE_SEQS } } }),
      prisma.user.findMany({ where: { isActive: true }, select: { employeeId: true } }),
      prisma.erpMaterial.count(),
    ]);
    const devices = equipmentNodes + SYNTHETIC_EQUIPMENT_NODE_SEQS.length - existingSyntheticNodes;
    const users = userRows.filter((user) => isDuyenHaiEmployeeId(user.employeeId)).length;
    return ok({ devices, users, materials });
  });
}
