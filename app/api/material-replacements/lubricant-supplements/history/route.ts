import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isLubricantSupervisor } from "@/lib/lubricant-access";
import { isSupplementReason, materialCategoryMatches } from "@/lib/constants";
import { sortSupplementHistory, vnDay, type SupplementHistoryItem } from "@/lib/lubricant-supplements";

export const dynamic = "force-dynamic";

/** GET ?replacementId= — toàn bộ lịch sử bổ sung của một điểm (nhập tay + phiếu vật tư), mới nhất trước. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, "replacement-manage", ["read", "personal", "manage", "full"], "Không đủ quyền xem lịch sử bổ sung dầu mỡ");
    const replacementId = new URL(req.url).searchParams.get("replacementId") ?? "";
    const point = replacementId
      ? await prisma.materialReplacement.findUnique({
        where: { id: replacementId },
        select: { id: true, deviceSeq: true, machine: true, materialId: true, alternateMaterialIds: true },
      })
      : null;
    if (!point) return fail("Không tìm thấy điểm theo dõi", 404);
    const oilIds = [point.materialId, ...point.alternateMaterialIds];

    const manual = await prisma.lubricantSupplement.findMany({
      where: { replacementId: point.id },
      include: { material: { select: { name: true } } },
    });
    const logs = await prisma.materialReplacementLog.findMany({
      where: {
        ticketId: { not: null }, material: { category: "Dầu bôi trơn" },
        OR: [
          { replacementId: point.id },
          ...(point.deviceSeq ? [{ deviceSeq: point.deviceSeq, machine: point.machine, materialId: { in: oilIds } }] : []),
        ],
      },
      select: {
        id: true, replacedAt: true, usedQuantity: true, quantity: true, unitLabel: true, note: true, ticketId: true, proposalNumber: true,
        material: { select: { name: true, category: true } },
      },
    });
    const tickets = await prisma.materialTicket.findMany({
      where: { id: { in: [...new Set(logs.flatMap((log) => log.ticketId ?? []))] } },
      select: { id: true, proposalNote: true, sequenceMonth: true, sequenceNumber: true },
    });
    const supplementTickets = new Map(tickets.filter((ticket) => isSupplementReason(ticket.proposalNote)).map((ticket) => [ticket.id, ticket]));

    const items: SupplementHistoryItem[] = [
      ...manual.map((row): SupplementHistoryItem => ({
        id: row.id, source: "manual", sourceLabel: "Nhập tay", date: vnDay(row.suppliedAt), quantity: row.quantity, unit: row.unit,
        materialName: row.material?.name ?? null, note: row.note, byName: row.createdByName,
        deletable: row.createdById === user.id || isLubricantSupervisor(user),
      })),
      ...logs.flatMap((log): SupplementHistoryItem[] => {
        const ticket = log.ticketId ? supplementTickets.get(log.ticketId) : undefined;
        if (!ticket || !materialCategoryMatches(log.material?.category, "Dầu bôi trơn")) return [];
        return [{
          id: log.id, source: "ticket", sourceLabel: `Phiếu ${log.proposalNumber ?? `${ticket.sequenceNumber}/${ticket.sequenceMonth}`}`,
          date: vnDay(log.replacedAt), quantity: log.usedQuantity ?? log.quantity, unit: log.unitLabel,
          materialName: log.material?.name ?? null, note: log.note, byName: null, deletable: false,
        }];
      }),
    ];
    return ok(sortSupplementHistory(items));
  });
}
