import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { suggestOilType, proposeNewGroups, type MaterialLike, type OilTypeLike, type NewGroupProposal } from "@/lib/oil-matching";

// Các loại vật tư được gom nhóm (khớp Material.category / ErpMaterial.category).
export const GROUPABLE_CATEGORIES = ["Dầu bôi trơn", "Lõi lọc dầu", "Thiết bị C&I", "Hóa Chất", "Bi Nghiền Than"] as const;
export type GroupableCategory = (typeof GROUPABLE_CATEGORIES)[number];
export const STANDALONE_GROUP_PREFIX = "__SINGLE__";

export function isGroupableCategory(value: unknown): value is GroupableCategory {
  return typeof value === "string" && (GROUPABLE_CATEGORIES as readonly string[]).includes(value);
}

// Điều kiện lọc mã ERP theo loại. Mã chưa phân loại (category null — dữ liệu cũ)
// được tính vào "Dầu bôi trơn" vì import Excel cũng mặc định về loại này.
export function categoryScanFilter(category: GroupableCategory): Prisma.ErpMaterialWhereInput {
  return category === "Dầu bôi trơn" ? { isActive: true, OR: [{ category }, { category: null }] } : { category, isActive: true };
}

export interface OilGroupingSyncResult {
  scanned: number;
  suggested: number;
  unmapped: number;
  newGroupProposals: NewGroupProposal[];
}

/**
 * Chạy engine gợi ý gom nhóm cho mọi mã UNMAPPED/SUGGESTED, tách riêng từng
 * loại vật tư (mã chỉ được gợi ý vào nhóm cùng loại). Idempotent — không đụng
 * các mã đã CONFIRMED/IGNORED. Gọi từ nút "Quét gợi ý" trên UI hoặc gọi trực
 * tiếp sau khi nhập Excel ERP.
 */
export async function runOilGroupingSync(only?: GroupableCategory): Promise<OilGroupingSyncResult> {
  const categories = only ? [only] : [...GROUPABLE_CATEGORIES];
  const total: OilGroupingSyncResult = { scanned: 0, suggested: 0, unmapped: 0, newGroupProposals: [] };

  for (const category of categories) {
    // 1. Nạp các nhóm CÙNG LOẠI + thành viên đã CONFIRMED
    const oilTypes = await prisma.oilType.findMany({
      where: { category, NOT: { code: { startsWith: STANDALONE_GROUP_PREFIX } } },
      include: {
        materials: {
          where: { mappingStatus: "CONFIRMED", isActive: true },
          select: { id: true, code: true, name: true },
        },
      },
    });
    const typeLikes: OilTypeLike[] = oilTypes.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      members: t.materials.map((m) => ({ id: m.id, erpCode: m.code, name: m.name })),
    }));

    // 2. Quét các mã cùng loại chưa gom (UNMAPPED + SUGGESTED để cập nhật gợi ý cũ)
    const pending = await prisma.erpMaterial.findMany({
      where: { mappingStatus: { in: ["UNMAPPED", "SUGGESTED"] }, ...categoryScanFilter(category) },
      select: { id: true, code: true, name: true },
    });

    const stillUnmapped: MaterialLike[] = [];

    for (const m of pending) {
      const like: MaterialLike = { id: m.id, erpCode: m.code, name: m.name };
      const s = suggestOilType(like, typeLikes);
      if (s) {
        await prisma.$transaction([
          prisma.erpMaterial.update({
            where: { id: m.id },
            data: {
              mappingStatus: "SUGGESTED",
              suggestedOilTypeId: s.oilTypeId,
              suggestedScore: s.score,
              suggestedReason: s.reason,
            },
          }),
          prisma.oilTypeMappingLog.create({
            data: {
              materialId: m.id,
              oilTypeId: s.oilTypeId,
              action: "SUGGESTED",
              score: s.score,
              reason: s.reason,
              userId: null, // hệ thống
            },
          }),
        ]);
        total.suggested++;
      } else {
        await prisma.erpMaterial.update({
          where: { id: m.id },
          data: {
            mappingStatus: "UNMAPPED",
            suggestedOilTypeId: null,
            suggestedScore: null,
            suggestedReason: null,
          },
        });
        stillUnmapped.push(like);
      }
    }

    // 3. Các mã mồ côi giống nhau → gợi ý tạo nhóm mới (trả về cho UI, không ghi DB)
    total.scanned += pending.length;
    total.unmapped += stillUnmapped.length;
    total.newGroupProposals.push(...proposeNewGroups(stillUnmapped));
  }

  return total;
}

/** Số mã đang chờ phân nhóm theo từng loại vật tư (badge trên tab). */
export async function pendingCountByCategory(): Promise<Record<GroupableCategory, number>> {
  const rows = await prisma.erpMaterial.groupBy({
    by: ["category"],
    where: { mappingStatus: { in: ["SUGGESTED", "UNMAPPED"] }, isActive: true },
    _count: { _all: true },
  });
  const out = Object.fromEntries(GROUPABLE_CATEGORIES.map((c) => [c, 0])) as Record<GroupableCategory, number>;
  for (const row of rows) {
    if (row.category === null) out["Dầu bôi trơn"] += row._count._all; // dữ liệu cũ chưa phân loại
    else if (isGroupableCategory(row.category)) out[row.category] += row._count._all;
    // loại khác không gom nhóm — bỏ qua
  }
  return out;
}
