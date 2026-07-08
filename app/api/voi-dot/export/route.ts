// Endpoint xuất Excel sơ đồ vòi đốt: /api/voi-dot/export
// Tải dữ liệu 2 tổ máy từ DB → report model → workbook.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handle } from "@/lib/api";
import { assertOilSootAccess } from "@/lib/server-access";
import type { BurnerRow } from "@/lib/burner-status";
import { buildUnitReport } from "@/lib/voi-dot/report-model";
import { buildBurnerWorkbook } from "@/lib/voi-dot/export-xlsx";

// exceljs cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNITS = ["S1", "S2"];

// Map field DB (OilGun) → BurnerRow.
function toBurnerRow(g: {
  code: string; status: string; defectSccn: string | null; defectScd: string | null;
  forceFlame: boolean; coalStatus: string; coalDefectNote: string | null;
}): BurnerRow {
  return {
    code: g.code,
    status: g.status === "unavailable" ? "unavailable" : "available",
    defectSccn: g.defectSccn,
    defectScd: g.defectScd,
    forceFlame: !!g.forceFlame,
    coalStatus: g.coalStatus === "unavailable" ? "unavailable" : "available",
    coalDefectNote: g.coalDefectNote,
  };
}

async function getNote(machine: string): Promise<string> {
  const n = await prisma.oilGunNote.findUnique({ where: { machine } });
  return n?.note ?? "";
}

async function loadUnit(machine: string) {
  const rows = await prisma.oilGun.findMany({ where: { machine }, orderBy: { position: "asc" } });
  return buildUnitReport(rows.map(toBurnerRow), machine, await getNote(machine));
}

export async function GET(_req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user); // chặn cứng theo chức vụ như các API vòi đốt khác

    const units = await Promise.all(UNITS.map(loadUnit));
    const stamp = new Date().toISOString().slice(0, 10);
    const xlsx = await buildBurnerWorkbook(units);
    // Uint8Array là body hợp lệ ở runtime Node; ép BodyInit để tránh ma sát type-lib.
    return new Response(xlsx as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="so-do-voi-dot-${stamp}.xlsx"`,
      },
    });
  });
}
