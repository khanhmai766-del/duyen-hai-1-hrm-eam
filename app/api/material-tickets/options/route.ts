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

    // Mỗi vật tư kèm danh sách THIẾT BỊ đã khai báo (điểm dùng trong Danh mục vật tư)
    // để dropdown thiết bị ở bước Đề xuất lọc theo đúng vật tư được chọn.
    const materialsRaw = await prisma.material.findMany({
      select: {
        id: true, code: true, name: true, unit: true, quantity: true, category: true,
        replacements: {
          where: { isActive: false, deviceSeq: { not: null } },
          select: { deviceSeq: true, location: true, system: true, device: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    const materials = materialsRaw.map((m) => {
      const seen = new Set<string>();
      const mdevices: { seq: string; label: string }[] = [];
      for (const r of m.replacements) {
        const seq = r.deviceSeq!;
        if (seen.has(seq)) continue;
        seen.add(seq);
        mdevices.push({ seq, label: r.location || r.device?.name || r.system || seq });
      }
      return { id: m.id, code: m.code, name: m.name, unit: m.unit, quantity: m.quantity, category: m.category, devices: mdevices };
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
