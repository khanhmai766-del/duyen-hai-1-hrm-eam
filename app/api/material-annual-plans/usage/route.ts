import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { periodKeyOf } from "@/lib/chemical-inventory/normalize";
import { annualPlanGroupOfCategory, annualPlanNameKey } from "@/lib/material-annual-plan-import";
import { materialTicketReference } from "@/lib/material-ticket-sequence";

export const dynamic = "force-dynamic";

/**
 * GET /api/material-annual-plans/usage?year=&category=&nameKey=[&month=]
 *
 * Danh sách phiếu đã tạo nên con số luỹ kế của MỘT dòng biểu QLVT.20.
 *
 * Đây là thứ bản Excel không làm được và là lý do số liệu cũ trôi mà không ai truy được: luỹ kế
 * của dầu Total Preslia 32 đứng yên ở 832 lít suốt ba tháng trong khi vẫn yêu cầu thêm 1.248
 * lít, mà không có cách nào biết con số 832 đến từ đâu.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "material-manage",
      ["read", "personal", "manage", "full"],
      "Không đủ quyền xem chi tiết sử dụng vật tư",
    );

    const sp = req.nextUrl.searchParams;
    const year = Number(sp.get("year"));
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return fail("Năm không hợp lệ", 400);
    const category = String(sp.get("category") ?? "").trim();
    const nameKey = String(sp.get("nameKey") ?? "").trim();
    if (!category || !nameKey) return fail("Thiếu nhóm hoặc tên vật tư cần tra");
    const monthRaw = sp.get("month");
    const month = monthRaw ? Number(monthRaw) : null;
    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      return fail("Tháng không hợp lệ", 400);
    }

    // Nới biên ±1 ngày rồi lọc lại theo giờ VN — cùng cách chốt kỳ với sổ hóa chất.
    const BOUNDARY_MS = 24 * 60 * 60 * 1000;
    const logs = await prisma.materialReplacementLog.findMany({
      where: {
        usedQuantity: { not: null },
        replacedAt: {
          gte: new Date(Date.UTC(year, 0, 1) - BOUNDARY_MS),
          lt: new Date(Date.UTC(year + 1, 0, 1) + BOUNDARY_MS),
        },
        OR: [{ importSource: null }, { importSource: { not: "SHEET_VT" } }],
      },
      orderBy: { replacedAt: "desc" },
      select: {
        id: true,
        replacedAt: true,
        usedQuantity: true,
        quantity: true,
        unitLabel: true,
        unplanned: true,
        deviceSeq: true,
        deviceLabel: true,
        systemLabel: true,
        pctNumber: true,
        requestNumber: true,
        bbntDoNumber: true,
        bbntDoUrl: true,
        proposalNumber: true,
        deliveryNoteNumber: true,
        ticketId: true,
        note: true,
        doneBy: { select: { name: true } },
        material: { select: { name: true, category: true } },
      },
    });

    const matched = logs.filter((log) => {
      if (!log.material?.name) return false;
      if (annualPlanGroupOfCategory(log.material.category) !== category) return false;
      if (annualPlanNameKey(log.material.name) !== nameKey) return false;
      const periodKey = periodKeyOf(log.replacedAt);
      if (!periodKey.startsWith(`${year}-`)) return false;
      return month === null || Number(periodKey.slice(5, 7)) === month;
    });

    // Số phiếu vật tư chỉ tra khi thật sự có dòng cần hiển thị.
    const ticketIds = [...new Set(matched.map((log) => log.ticketId).filter((id): id is string => Boolean(id)))];
    const tickets = ticketIds.length
      ? await prisma.materialTicket.findMany({
          where: { id: { in: ticketIds } },
          select: { id: true, sequenceMonth: true, sequenceNumber: true, sequenceScope: true, status: true },
        })
      : [];
    const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

    const rows = matched.map((log) => {
      const ticket = log.ticketId ? ticketById.get(log.ticketId) ?? null : null;
      return {
        id: log.id,
        replacedAt: log.replacedAt,
        periodKey: periodKeyOf(log.replacedAt),
        usedQuantity: log.usedQuantity,
        plannedQuantity: log.quantity,
        unitLabel: log.unitLabel,
        unplanned: log.unplanned,
        materialName: log.material?.name ?? null,
        deviceLabel: log.deviceLabel ?? log.deviceSeq,
        systemLabel: log.systemLabel,
        pctNumber: log.pctNumber,
        requestNumber: log.requestNumber,
        bbntDoNumber: log.bbntDoNumber,
        bbntDoUrl: log.bbntDoUrl,
        proposalNumber: log.proposalNumber,
        deliveryNoteNumber: log.deliveryNoteNumber,
        doneByName: log.doneBy?.name ?? null,
        note: log.note,
        ticketId: log.ticketId,
        ticketNumber: ticket ? materialTicketReference(ticket) : null,
        ticketStatus: ticket?.status ?? null,
      };
    });

    return ok({
      year,
      month,
      rows,
      total: rows.reduce((sum, row) => sum + (row.usedQuantity ?? 0), 0),
      unplannedTotal: rows.filter((row) => row.unplanned).reduce((sum, row) => sum + (row.usedQuantity ?? 0), 0),
    });
  });
}
