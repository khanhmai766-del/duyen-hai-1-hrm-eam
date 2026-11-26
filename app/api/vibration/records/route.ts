import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok } from "@/lib/api";
import { classifyDevice } from "@/lib/vibration/classify";
import { MNK_AREA, MNK_SHIFT_NAMES, SHIFT_IDS, VIB_KINDS, type ShiftId, type VibKind } from "@/lib/vibration/constants";
import { addDays, isValidDate } from "@/lib/vibration/parse";
import { saveVibrationRecords, type SaveBody } from "@/lib/vibration/save";
import { requireVibrationEntry, requireVibrationView, toRecordDto } from "@/lib/vibration/server";
import type { VibrationRecordDto } from "@/lib/vibration/types";

export const dynamic = "force-dynamic";

const shiftIndex = (s: string | null) => (s ? SHIFT_IDS.indexOf(s as ShiftId) : -1);

/** Số đo theo loại + ngày (+ ca). Query: kind (bắt buộc), date YYYY-MM-DD (bắt buộc, hoặc from+to YYYY-MM-DD, tối đa 400 ngày, trả nhiều ngày; không dùng với withPrevious/MNK-shift),
 *  shift (MILL/TBNT lọc theo ca ghi; MNK lọc theo ca của động cơ), withPrevious=1 (MILL/TBNT, cần shift: kèm lần đo
 *  liền trước của từng thiết bị, so theo (ngày, ca)). Trả `data: VibrationRecordDto[]`,
 *  `meta.previous: Record<deviceId, VibrationRecordDto>`. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireVibrationView();
    const p = req.nextUrl.searchParams;
    const kind = p.get("kind") as VibKind | null;
    const date = p.get("date");
    const shiftParam = p.get("shift");
    if (!kind || !VIB_KINDS.includes(kind)) return fail("Thiếu hoặc sai loại số đo (kind)", 400);
    const from = p.get("from");
    const to = p.get("to");
    const ranged = !date && isValidDate(from) && isValidDate(to);
    if (ranged && (from > to || addDays(from, 400) < to)) return fail("Khoảng ngày (from–to) không hợp lệ hoặc quá 400 ngày", 400);
    if (!ranged && !isValidDate(date)) return fail("Thiếu hoặc sai ngày (date, YYYY-MM-DD)", 400);
    if (shiftParam && !SHIFT_IDS.includes(shiftParam as ShiftId)) return fail("Ca không hợp lệ", 400);
    const shift = shiftParam as ShiftId | null;

    const where: Prisma.VibrationRecordWhereInput = ranged ? { kind, date: { gte: from!, lte: to! } } : { kind, date: date! };
    if ((kind === "MILL" || kind === "TBNT") && shift) where.shift = shift;
    if (kind === "MNK" && shift) {
      const devs = await prisma.vibrationDevice.findMany({ where: { area: MNK_AREA, name: { in: MNK_SHIFT_NAMES[shift] } }, select: { id: true } });
      where.deviceId = { in: devs.map((d) => d.id) };
    }
    const rows = await prisma.vibrationRecord.findMany({ where, orderBy: { savedAt: "asc" } });
    const meta: Record<string, unknown> = {};

    if (!ranged && p.get("withPrevious") === "1" && (kind === "MILL" || kind === "TBNT") && shift) {
      const devices = await prisma.vibrationDevice.findMany({ where: { active: true }, select: { id: true, area: true, name: true } });
      const ids = devices.filter((d) => classifyDevice({ ...d, active: true }).kind === kind).map((d) => d.id);
      const previous: Record<string, VibrationRecordDto> = {};
      await Promise.all(
        ids.map(async (deviceId) => {
          const list = await prisma.vibrationRecord.findMany({
            where: { deviceId, kind, date: { lte: date! } },
            orderBy: [{ date: "desc" }, { savedAt: "desc" }],
            take: 8,
          });
          const best = list
            .filter((r) => r.date! < date! || (r.date === date! && shiftIndex(r.shift) < shiftIndex(shift)))
            .sort((a, b) => (a.date === b.date ? shiftIndex(b.shift) - shiftIndex(a.shift) : a.date! < b.date! ? 1 : -1))[0];
          if (best) previous[deviceId] = toRecordDto(best);
        })
      );
      meta.previous = previous;
    }
    return ok(rows.map(toRecordDto), meta);
  });
}

/** Lưu số đo (upsert). Cần quyền vibration-entry.
 *  Body: { kind: "WEEKLY"|"MNK"|"MILL"|"TBNT", date: "YYYY-MM-DD", shift?: "sang"|"chieu"|"dem" (bắt buộc với MILL/TBNT),
 *          items: [{ deviceId, person, measureTime?: "HH:mm", power?: number|null, values?: (number|null)[23],
 *                    millData?: { b1vX…b6dZ, b1t…b6t, gearSmall, gearRing, oil: number|null }, note?: string }] }
 *  Khoá duy nhất: WEEKLY/MNK = thiết bị+ngày; MILL/TBNT = thiết bị+ngày+ca. Thiết bị không có số/nhận xét bị bỏ qua.
 *  MILL: millData được GỘP vào bản ghi cũ (gửi riêng {oil} để chỉ cập nhật dầu VRL).
 *  Trả data: VibrationRecordDto[] đã lưu, meta.skipped = deviceId bị bỏ qua. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationEntry();
    const body = (await req.json().catch(() => null)) as SaveBody | null;
    if (!body) return fail("Dữ liệu gửi lên không hợp lệ", 400);
    const result = await saveVibrationRecords(user.id, body);
    await audit(
      user.id, "SAVE_VIBRATION_RECORDS", "VibrationRecord", undefined,
      `${result.kind} ${result.date}${result.shift ? ` ca ${result.shift}` : ""}: ${result.saved.length} thiết bị`
    );
    return ok(result.saved.map(toRecordDto), { skipped: result.skipped });
  });
}
