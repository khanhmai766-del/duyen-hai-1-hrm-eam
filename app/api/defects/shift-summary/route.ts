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
    return ok({
      section,
      shiftType: shift.shiftType,
      shiftLabel: shift.label,
      timeLabel: shift.timeLabel,
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      issued: visible.length,
      cancelled,
      active: visible.length - cancelled,
    });
  });
}
