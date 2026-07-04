import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { getPositionScopes } from "@/lib/material-workflow";

export const dynamic = "force-dynamic";

// GET /api/material-tickets/options
// Trả về: cây thiết bị ĐÃ LỌC theo cương vị người đăng nhập + danh mục vật tư (kèm tồn kho).
// Dùng cho form đề xuất (B1) và nhập liệu Ứng (Ư1).
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const scopes = await getPositionScopes(user.position);

    const devices = scopes.length
      ? await prisma.equipmentNode.findMany({
          where: {
            OR: scopes.flatMap((s) => [{ seq: s }, { seq: { startsWith: s + "." } }]),
          },
          select: { seq: true, name: true, depth: true },
          orderBy: { sort: "asc" },
          take: 2000,
        })
      : [];

    const materials = await prisma.material.findMany({
      select: { id: true, code: true, name: true, unit: true, quantity: true },
      orderBy: { name: "asc" },
    });

    // Danh sách cương vị có phân giao cây thiết bị -> để Trưởng Ca chọn khi tạo phiếu
    const posRows = await prisma.positionSystemScope.findMany({
      distinct: ["position"],
      select: { position: true },
      orderBy: { position: "asc" },
    });
    const positions = posRows.map((r) => r.position);

    return ok({ devices, materials, scopes, positions });
  });
}
