import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { getPositionScopes } from "@/lib/material-workflow";
import { announcementShiftRosterPositionOptions } from "@/lib/positions";

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
      : await prisma.equipmentNode.findMany({
          select: { seq: true, name: true, depth: true },
          orderBy: { sort: "asc" },
          take: 2000,
        });

    // Mỗi vật tư kèm danh sách THIẾT BỊ đã khai báo (điểm dùng trong Danh mục vật tư)
    // để dropdown thiết bị ở bước Đề xuất lọc theo đúng vật tư được chọn.
    const materialsRaw = await prisma.material.findMany({
      select: {
        id: true, code: true, erpCodes: true, name: true, unit: true, quantity: true, category: true, machine: true,
        replacements: {
          where: { isActive: false, deviceSeq: { not: null } },
          select: { id: true, deviceSeq: true, location: true, system: true, managingPosition: true, device: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    const erpCodes = Array.from(new Set(materialsRaw.flatMap((m) => (m.erpCodes?.length ? m.erpCodes : [m.code]).filter(Boolean))));
    const erpRows = erpCodes.length
      ? await prisma.$queryRaw<Array<{ code: string; name: string; erpStock: number }>>`
          SELECT "code", "name", "erpStock"
          FROM "ErpMaterial"
          WHERE "isActive" = TRUE AND "code" = ANY(${erpCodes}::text[])
            AND "mappingStatus" = 'CONFIRMED'
        `
      : [];
    const erpStockByCode = new Map(erpRows.map((row) => [row.code, row.erpStock]));
    const erpNameByCode = new Map(erpRows.map((row) => [row.code, row.name]));
    const activeErpCodes = new Set(erpRows.map((row) => row.code));
    const materials = materialsRaw.map((m) => {
      const seen = new Set<string>();
      const positions = new Set<string>();
      const mdevices: { seq: string; label: string }[] = [];
      for (const r of m.replacements) {
        if (r.managingPosition) positions.add(r.managingPosition);
        const seq = r.device ? r.deviceSeq! : `manual:${r.id}`;
        if (seen.has(seq)) continue;
        seen.add(seq);
        mdevices.push({ seq, label: r.location || r.device?.name || r.system || seq });
      }
      const codes = (m.erpCodes?.length ? m.erpCodes : [m.code]).filter((code) => Boolean(code) && activeErpCodes.has(code));
      return {
        id: m.id,
        code: m.code,
        erpCodes: codes.map((code) => ({ code, name: erpNameByCode.get(code) ?? m.name, erpStock: erpStockByCode.get(code) ?? 0 })),
        name: m.name,
        unit: m.unit,
        quantity: m.quantity,
        category: m.category,
        machine: m.machine,
        managingPositions: [...positions],
        devices: mdevices,
      };
    }).filter((material) => material.erpCodes.length > 0);

    // Dùng cùng nguồn cương vị cố định với Mệnh lệnh/Forum. Không trộn dữ liệu
    // user để tránh sinh bản sao chỉ khác kiểu viết hoa (Lò phó / Lò Phó...).
    const positions = announcementShiftRosterPositionOptions();

    return ok({ devices, materials, scopes, positions });
  });
}
