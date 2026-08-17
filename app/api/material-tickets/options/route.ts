import { prisma } from "@/lib/prisma";
import { ok, requireUser, handle } from "@/lib/api";
import { getPositionScopes, MATERIAL_TICKET_EXTRA_ASSIGNED_POSITIONS } from "@/lib/material-workflow";
import { announcementShiftRosterPositionOptions } from "@/lib/positions";
import { positionCodeOf, positionLabelOf } from "@/lib/position-catalog";
import { replacementPointDisplayLabel, replacementPointSelectionKey } from "@/lib/material-replacement-display";

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
          select: { seq: true, name: true, depth: true, parentSeq: true },
          orderBy: { sort: "asc" },
          take: 2000,
        })
      : await prisma.equipmentNode.findMany({
          select: { seq: true, name: true, depth: true, parentSeq: true },
          orderBy: { sort: "asc" },
          take: 2000,
        });

    // Danh sách điểm thay thế dùng để lập Đề xuất không phụ thuộc lịch theo dõi:
    // điểm intervalMonths=0 / isActive=false vẫn phải chọn được khi dầu hao hụt
    // hoặc kết quả phân tích không đạt. Trạng thái theo dõi chỉ dùng cho cảnh báo định kỳ.
    const materialsRaw = await prisma.material.findMany({
      select: {
        id: true, code: true, erpCodes: true, name: true, unit: true, quantity: true, category: true, machine: true,
        replacements: {
          select: {
            id: true,
            deviceSeq: true,
            location: true,
            system: true,
            managingPosition: true,
            managingPositionCode: true,
            recoveryOnSupplement: true,
            device: { select: { name: true, parentSeq: true } },
          },
          // Bản ghi khai báo (không theo dõi) đứng trước bản ghi lịch trùng điểm,
          // để dropdown giữ định danh ổn định khi khử trùng.
          orderBy: [{ isActive: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });
    const erpCodes = Array.from(new Set(materialsRaw.flatMap((m) => (m.erpCodes?.length ? m.erpCodes : [m.code]).filter(Boolean))));
    const parentSeqs = Array.from(new Set(materialsRaw.flatMap((material) =>
      material.replacements.map((replacement) => replacement.device?.parentSeq).filter(Boolean) as string[]
    )));
    const [erpRows, parentNodes] = await Promise.all([
      erpCodes.length
        ? prisma.$queryRaw<Array<{ code: string; name: string; erpStock: number }>>`
            SELECT "code", "name", "erpStock"
            FROM "ErpMaterial"
            WHERE "isActive" = TRUE AND "code" = ANY(${erpCodes}::text[])
              AND "mappingStatus" = 'CONFIRMED'
          `
        : Promise.resolve([]),
      parentSeqs.length
        ? prisma.equipmentNode.findMany({ where: { seq: { in: parentSeqs } }, select: { seq: true, name: true } })
        : Promise.resolve([]),
    ]);
    const erpStockByCode = new Map(erpRows.map((row) => [row.code, row.erpStock]));
    const erpNameByCode = new Map(erpRows.map((row) => [row.code, row.name]));
    const activeErpCodes = new Set(erpRows.map((row) => row.code));
    const deviceNameBySeq = new Map([
      ...devices.map((device) => [device.seq, device.name] as const),
      ...parentNodes.map((device) => [device.seq, device.name] as const),
    ]);
    const materials = materialsRaw.map((m) => {
      const seen = new Set<string>();
      const positions = new Set<string>();
      const mdevices: { seq: string; label: string; system: string | null; managingPosition: string | null; recoveryOnSupplement: boolean }[] = [];
      for (const r of m.replacements) {
        const managingPosition = positionLabelOf(r.managingPositionCode ?? r.managingPosition);
        if (managingPosition) positions.add(managingPosition);
        const seq = replacementPointSelectionKey(r);
        const positionKey = positionCodeOf(r.managingPositionCode ?? r.managingPosition)
          ?? r.managingPosition?.trim().toLocaleLowerCase("vi")
          ?? "";
        const pointKey = r.deviceSeq
          ? `device:${r.deviceSeq}`
          : r.location
            ? `location:${r.location.trim().toLocaleLowerCase("vi")}::${r.system ?? ""}`
            : `system:${r.system?.trim().toLocaleLowerCase("vi") ?? r.id}`;
        const dedupeKey = `${pointKey}::${positionKey}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        mdevices.push({
          seq,
          label: replacementPointDisplayLabel(r),
          system: r.device?.parentSeq
            ? deviceNameBySeq.get(r.device.parentSeq) ?? r.system
            : r.system,
          managingPosition: managingPosition || null,
          recoveryOnSupplement: r.recoveryOnSupplement,
        });
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
    const positions = [
      ...announcementShiftRosterPositionOptions(),
      ...MATERIAL_TICKET_EXTRA_ASSIGNED_POSITIONS,
    ];

    return ok({ devices, materials, scopes, positions });
  });
}
