import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { getWorkflowRoleMap, stepAllowedWithMap } from "@/lib/material-workflow";
import { materialTicketReference } from "@/lib/material-ticket-sequence";

export const dynamic = "force-dynamic";

/**
 * Danh sách nhẹ cho chuông thông báo: chỉ người có quyền Nghiệm thu mới nhận các phiếu
 * đang chờ kiểm tra ảnh. Thông báo tự biến mất ngay khi ảnh được duyệt hoặc trả VHV.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const workflow = await getWorkflowRoleMap();
    if (!stepAllowedWithMap(workflow, "accept", user)) return ok([]);

    const tickets = await prisma.materialTicket.findMany({
      where: {
        type: { in: ["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"] },
        status: "CHO_NGHIEM_THU",
        OR: [
          { usagePhotoReviewStatus: null },
          { usagePhotoReviewStatus: "PENDING" },
        ],
      },
      select: {
        id: true,
        sequenceMonth: true,
        sequenceNumber: true,
        sequenceScope: true,
        unit: true,
        assignedPosition: true,
        materialCategory: true,
        usedAt: true,
        updatedAt: true,
      },
      orderBy: [{ usedAt: "asc" }, { updatedAt: "asc" }],
      take: 20,
    });

    return ok(tickets.map((ticket) => ({
      id: ticket.id,
      reference: materialTicketReference(ticket),
      unit: ticket.unit,
      assignedPosition: ticket.assignedPosition,
      materialCategory: ticket.materialCategory,
      date: (ticket.usedAt ?? ticket.updatedAt).toISOString(),
    })));
  });
}
