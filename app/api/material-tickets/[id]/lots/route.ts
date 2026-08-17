import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { availableLots, lotLabel, usedLotsOfTicket } from "@/lib/material-stock-lot";

export const dynamic = "force-dynamic";

/**
 * GET /api/material-tickets/[id]/lots
 * Các lô có thể dùng cho phiếu này + phần phiếu ĐANG chiếm của từng lô.
 *
 * `quantityLeft` đã TRỪ phần phiếu này đang giữ, nên `available` là số thật sự có thể lấy
 * thêm — nếu không cộng lại, phiếu đang giữ 5 lít sẽ tưởng lô đó đã hết và không cho sửa
 * phân bổ về đúng chỗ cũ.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const ticket = await prisma.materialTicket.findUnique({
      where: { id: params.id },
      select: {
        usedQuantity: true,
        items: { select: { material: { select: { code: true, unit: true, name: true } } }, take: 1 },
      },
    });
    if (!ticket) return fail("Không tìm thấy phiếu", 404);
    const material = ticket.items[0]?.material;
    if (!material) return fail("Phiếu chưa có vật tư", 404);

    const [lots, used] = await Promise.all([
      availableLots(prisma, material.code),
      usedLotsOfTicket(prisma, params.id),
    ]);
    const usedById = new Map(used.map((lot) => [lot.id, lot.used]));

    // Lô đã bị phiếu này dùng hết sạch sẽ không nằm trong `availableLots` (quantityLeft = 0),
    // nhưng vẫn phải hiện ra để người dùng nhìn thấy và chỉnh lại được.
    const merged = [...lots];
    for (const lot of used) if (!merged.some((item) => item.id === lot.id)) merged.push(lot);

    return ok({
      unit: material.unit,
      materialName: material.name,
      usedQuantity: ticket.usedQuantity ?? 0,
      lots: merged.map((lot) => {
        const mine = usedById.get(lot.id) ?? 0;
        return {
          id: lot.id,
          label: lotLabel(lot),
          erpCode: lot.erpCode,
          receivedAt: lot.receivedAt,
          available: lot.quantityLeft + mine,
          taken: mine,
        };
      }),
    });
  });
}
