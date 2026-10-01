// Endpoint xuất Excel sơ đồ vòi đốt: /api/voi-dot/export
// Tải dữ liệu 2 tổ máy từ DB → report model → workbook.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handle, fail } from "@/lib/api";
import { findOilGunSnapshot, isSnapshotDate, vietnamDate } from "@/lib/server/oil-gun-snapshot";
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

/** Trạng thái cuối ngày `date` từ ảnh chụp hằng ngày (lib/server/oil-gun-snapshot.ts). */
async function loadUnitAt(machine: string, date: string) {
  const snapshot = await findOilGunSnapshot(machine, date);
  if (!snapshot) throw fail(`Chưa có dữ liệu chụp của tổ máy ${machine} cho ngày ${date.split("-").reverse().join("/")}`, 404);
  return buildUnitReport(snapshot.guns.map(toBurnerRow), machine, snapshot.note);
}

// GET /api/voi-dot/export[?date=YYYY-MM-DD] — không có date = hiện tại; có date (trước hôm nay) = cuối ngày đó.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user); // chặn cứng theo chức vụ như các API vòi đốt khác

    const today = vietnamDate();
    const date = req.nextUrl.searchParams.get("date") || today;
    if (!isSnapshotDate(date) || date > today) throw fail("Ngày xuất không hợp lệ");
    const units = await Promise.all(UNITS.map(machine => date === today ? loadUnit(machine) : loadUnitAt(machine, date)));
    const stamp = date;
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
