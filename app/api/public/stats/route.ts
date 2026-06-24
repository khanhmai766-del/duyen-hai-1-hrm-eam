import { prisma } from "@/lib/prisma";
import { ok, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const SYNTHETIC_EQUIPMENT_NODE_SEQS = ["1.0", "1.1"];

// Số liệu công khai cho màn hình đăng nhập (không cần đăng nhập): tổng thiết bị
// và tổng người dùng. Chỉ trả về số đếm, không lộ dữ liệu chi tiết.
export async function GET() {
  return handle(async () => {
    const [equipmentNodes, existingSyntheticNodes] = await Promise.all([
      prisma.equipmentNode.count(),
      prisma.equipmentNode.count({ where: { seq: { in: SYNTHETIC_EQUIPMENT_NODE_SEQS } } }),
    ]);
    const devices = equipmentNodes + SYNTHETIC_EQUIPMENT_NODE_SEQS.length - existingSyntheticNodes;
    return ok({ devices });
  });
}
