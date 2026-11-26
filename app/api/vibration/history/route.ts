import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok } from "@/lib/api";
import { millMax, readingMax } from "@/lib/vibration/severity";
import { requireVibrationView } from "@/lib/vibration/server";
import type { VibKind, ShiftId } from "@/lib/vibration/constants";
import type { VibrationHistoryRow } from "@/lib/vibration/types";

export const dynamic = "force-dynamic";

/** Lịch sử đo độ rung của các thiết bị đo đã ánh xạ vào MỘT nút cây thiết bị (khớp đúng seq).
 *  Query: equipmentSeq (bắt buộc), limit (mặc định 20, tối đa 200). Mới nhất trước. Trả data: VibrationHistoryRow[]. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireVibrationView();
    const seq = req.nextUrl.searchParams.get("equipmentSeq")?.trim();
    if (!seq) return fail("Thiếu equipmentSeq", 400);
    const limit = Math.min(Math.max(Math.trunc(Number(req.nextUrl.searchParams.get("limit"))) || 20, 1), 200);

    const devices = await prisma.vibrationDevice.findMany({ where: { equipmentSeq: seq }, select: { id: true, name: true } });
    if (!devices.length) return ok<VibrationHistoryRow[]>([]);
    const names = new Map(devices.map((d) => [d.id, d.name]));
    const rows = await prisma.vibrationRecord.findMany({
      where: { deviceId: { in: devices.map((d) => d.id) } },
      orderBy: [{ date: { sort: "desc", nulls: "last" } }, { savedAt: "desc" }],
      take: limit,
    });
    return ok(
      rows.map<VibrationHistoryRow>((r) => {
        const m = r.kind === "MILL" ? millMax(r.millData as Record<string, unknown> | null) : readingMax(Array.isArray(r.values) ? (r.values as unknown[]) : []);
        return {
          id: r.id,
          deviceId: r.deviceId,
          deviceName: names.get(r.deviceId) ?? "",
          date: r.date,
          kind: r.kind as VibKind,
          shift: r.shift as ShiftId | null,
          person: r.person,
          maxVelocity: m.maxVelocity,
          maxTemp: m.maxTemp,
          note: r.note,
        };
      })
    );
  });
}
