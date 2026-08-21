import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_TRUCK_EDIT_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { positionsMatch } from "@/lib/position-catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/material-tickets/[id]/chemical-trucks
 * Các chuyến xe đã ghi vào sổ hóa chất từ phiếu này, kèm trạng thái khóa.
 *
 * Payload của phiếu chỉ mang `chemicalReceiptIds` (mảng id), không mang số liệu, nên
 * trước đây bảng xe luôn mở ra trống trơn dù đã ghi — nhìn y hệt lúc chưa nhập gì.
 *
 * Cố ý KHÔNG đi qua `/api/chemical-inventory/receipts`: cửa đó đòi quyền giữ sổ hóa
 * chất, mà VHV ghi xe thì thường không có. Ở đây quyền xem là quyền xem phiếu.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const ticket = await prisma.materialTicket.findUnique({
      where: { id: params.id },
      select: { id: true, assignedPosition: true, chemicalReceiptIds: true },
    });
    if (!ticket) return fail("Không tìm thấy phiếu", 404);

    const rows = ticket.chemicalReceiptIds.length
      ? await prisma.chemicalReceipt.findMany({
          where: { id: { in: ticket.chemicalReceiptIds } },
          orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            receivedAt: true,
            vehicleNumber: true,
            plantWeight: true,
            acceptedWeight: true,
            note: true,
            source: true,
          },
        })
      : [];

    // Decimal của Prisma không qua được ranh giới Server → Client, phải đổi sang số.
    const trucks = rows.map((row) => ({
      id: row.id,
      receivedAt: row.receivedAt.toISOString().slice(0, 10),
      vehicleNumber: row.vehicleNumber,
      plantWeight: row.plantWeight ? row.plantWeight.toNumber() : null,
      acceptedWeight: row.acceptedWeight.toNumber(),
      note: row.note,
      /** Dòng vốn có từ nhật ký ngày, phiếu chỉ gắn vào — sửa ở đây sẽ đụng số của người khác. */
      fromDailyLog: row.source !== "MATERIAL_TICKET",
    }));

    const locked = trucks.length > 0;
    const assigned = user.role === "ADMIN" || positionsMatch(user.position, ticket.assignedPosition);
    const canUnlock = await hasPermissionLevel(user, CHEMICAL_TRUCK_EDIT_PERMISSION_ID, ["manage", "full"]);

    return ok({
      trucks,
      locked,
      // Ghi LẦN ĐẦU: chính VHV được giao. Sửa lại sau khi chốt: phải có quyền riêng.
      canEdit: assigned && (!locked || canUnlock),
      canUnlock,
    });
  });
}
