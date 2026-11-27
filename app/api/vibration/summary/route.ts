import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok } from "@/lib/api";
import { MEASURE_GROUPS } from "@/lib/vibration/constants";
import { computeEntrySummary, MNK_SHIFT_GROUP, summaryFromDate } from "@/lib/vibration/entry-summary";
import { isValidDate, vnToday } from "@/lib/vibration/parse";
import { requireVibrationView } from "@/lib/vibration/server";
import { compareAreas } from "@/components/vibration/vibration-area-order";

export const dynamic = "force-dynamic";

const GROUPS: string[] = ["all", MNK_SHIFT_GROUP, ...MEASURE_GROUPS.map((g) => g.id)];

/** Tổng hợp tiến độ nhập theo cương vị / kỳ đo (cho TKLM, TKĐ, Trưởng ca, KTV…). Query: date YYYY-MM-DD (mặc định hôm nay VN),
 *  group = id kỳ đo | all | mnkca (mặc định all), area = tên cương vị | all. Trả `data: EntrySummary`. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireVibrationView();
    const p = req.nextUrl.searchParams;
    const date = p.get("date") || vnToday();
    const group = p.get("group") || "all";
    const area = p.get("area") || "all";
    if (!isValidDate(date)) return fail("Sai ngày (date, YYYY-MM-DD)", 400);
    if (!GROUPS.includes(group)) return fail("Kỳ đo không hợp lệ (group)", 400);

    const devices = await prisma.vibrationDevice.findMany({
      where: { active: true },
      select: { id: true, area: true, name: true, active: true, measureGroups: true },
      orderBy: [{ area: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    const records = await prisma.vibrationRecord.findMany({
      where: { date: { gte: summaryFromDate(group, date), lte: date } },
      select: { deviceId: true, date: true, values: true, millData: true, note: true },
    });
    return ok(
      computeEntrySummary({
        devices,
        records: records.map((r) => ({
          deviceId: r.deviceId,
          date: r.date,
          values: Array.isArray(r.values) ? (r.values as unknown[]) : [],
          millData: r.millData && typeof r.millData === "object" && !Array.isArray(r.millData) ? (r.millData as Record<string, unknown>) : null,
          note: r.note,
        })),
        date,
        group,
        area,
        compareAreas,
      })
    );
  });
}
