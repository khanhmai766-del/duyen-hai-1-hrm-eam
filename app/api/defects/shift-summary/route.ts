import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseDefectSection, DEFECT_SECTIONS } from "@/lib/defect-section";
import { N8N_DEFECT_SOURCE_SPREADSHEET_IDS } from "@/lib/defect-n8n-sync";
import { currentVietnamDefectShift } from "@/lib/defect-shift-window";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { canViewPosition, resolvePositionViewScope } from "@/lib/position-data-scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const section = parseDefectSection(req.nextUrl.searchParams.get("section"));
    const config = DEFECT_SECTIONS[section];
    const shift = currentVietnamDefectShift();
    const access = await resolveEquipmentAccessForUser(user);
    const positionScope = await resolvePositionViewScope(user, "defect");

    const sectionWhere: Prisma.DefectWhereInput = {
      OR: [
        { sourceSpreadsheetId: N8N_DEFECT_SOURCE_SPREADSHEET_IDS[config.source] },
        { sourceSpreadsheetId: null, requestType: { in: [...config.requestTypes] } },
      ],
    };
    const rows = await prisma.defect.findMany({
      where: {
        websiteCreated: true,
        createdAt: { gte: shift.start, lt: shift.end },
        AND: [sectionWhere],
      },
      select: {
        deviceSeq: true,
        device: true,
        system: true,
        requestType: true,
        cancelledAt: true,
      },
    });
    const visible = rows.filter((row) =>
      canViewPosition(row.system, positionScope)
      && (!access.hasExplicitScopes || (
        row.deviceSeq
          ? access.canViewSeq(row.deviceSeq)
          : access.canViewDeviceLike(row)
      ))
    );

    const cancelled = visible.filter((row) => row.cancelledAt !== null).length;
    const byRequestType = config.requestTypes.map((requestType) => {
      const requestRows = visible.filter((row) => row.requestType === requestType);
      const requestCancelled = requestRows.filter((row) => row.cancelledAt !== null).length;
      return {
        requestType,
        // Phiếu hủy tách thành một ô riêng, không cộng vào tổng của từng loại.
        issued: requestRows.length - requestCancelled,
        cancelled: requestCancelled,
        active: requestRows.length - requestCancelled,
      };
    });
    return ok({
      section,
      shiftType: shift.shiftType,
      shiftLabel: shift.label,
      timeLabel: shift.timeLabel,
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      // "Đã ra" là toàn bộ phiếu đã lập trong ca, bao gồm cả phiếu đã hủy.
      // Các ô từng loại phía trên đã loại phiếu hủy để tránh hiểu nhầm còn hiệu lực.
      issued: visible.length,
      cancelled,
      active: visible.length - cancelled,
      byRequestType,
    });
  });
}
