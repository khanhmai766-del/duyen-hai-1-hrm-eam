import { handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isLubricantSupervisor } from "@/lib/lubricant-access";
import { isSupplementReason, materialCategoryMatches } from "@/lib/constants";
import { latestSupplements } from "@/lib/lubricant-supplements";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, "replacement-manage", ["read", "personal", "manage", "full"], "Không đủ quyền xem lần bổ sung dầu mỡ");
    // Log không có quan hệ tới phiếu: lấy log dầu mỡ có ticketId rồi tra lý do phiếu theo lô (2 truy vấn).
    const logs = await prisma.materialReplacementLog.findMany({
      where: { ticketId: { not: null }, material: { category: "Dầu bôi trơn" } },
      select: {
        replacementId: true, deviceSeq: true, machine: true, materialId: true, replacedAt: true,
        usedQuantity: true, quantity: true, unitLabel: true, ticketId: true,
        material: { select: { category: true } },
      },
    });
    const tickets = await prisma.materialTicket.findMany({
      where: { id: { in: [...new Set(logs.flatMap((log) => log.ticketId ?? []))] } },
      select: { id: true, proposalNote: true },
    });
    const supplementTickets = new Set(tickets.filter((ticket) => isSupplementReason(ticket.proposalNote)).map((ticket) => ticket.id));
    return ok(latestSupplements(logs.filter((log) =>
      log.ticketId && supplementTickets.has(log.ticketId) && materialCategoryMatches(log.material?.category, "Dầu bôi trơn"))));
  });
}
