import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { suggestOilType, proposeNewGroups, type MaterialLike, type OilTypeLike, type NewGroupProposal } from "@/lib/oil-matching";

export interface OilGroupingSyncResult {
  scanned: number;
  suggested: number;
  unmapped: number;
  newGroupProposals: NewGroupProposal[];
}

// Chỉ quét các mã có khả năng là dầu: category "Dầu bôi trơn" hoặc chưa phân
// loại — tránh đổ cả danh mục ERP (C&I, bi nghiền...) vào tab "Chờ phân nhóm".
export const OIL_SCAN_FILTER: Prisma.ErpMaterialWhereInput = {
  OR: [{ category: "Dầu bôi trơn" }, { category: null }],
};

/**
 * Chạy engine gợi ý gom nhóm cho mọi mã UNMAPPED/SUGGESTED.
 * Idempotent — không đụng các mã đã CONFIRMED/IGNORED. Gọi từ nút
 * "Quét gợi ý" trên UI hoặc gọi trực tiếp sau khi nhập Excel ERP.
 */
export async function runOilGroupingSync(): Promise<OilGroupingSyncResult> {
  // 1. Nạp các nhóm hiện có + thành viên đã CONFIRMED
  const oilTypes = await prisma.oilType.findMany({
    include: {
      materials: {
        where: { mappingStatus: "CONFIRMED" },
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

  // 2. Quét các mã chưa gom (UNMAPPED + SUGGESTED để cập nhật lại gợi ý cũ)
  const pending = await prisma.erpMaterial.findMany({
    where: { mappingStatus: { in: ["UNMAPPED", "SUGGESTED"] }, ...OIL_SCAN_FILTER },
    select: { id: true, code: true, name: true },
  });

  let suggested = 0;
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
      suggested++;
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
  const newGroupProposals = proposeNewGroups(stillUnmapped);

  return {
    scanned: pending.length,
    suggested,
    unmapped: stillUnmapped.length,
    newGroupProposals,
  };
}
