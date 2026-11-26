import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok } from "@/lib/api";
import { metaDelete } from "@/lib/vibration/analysis/server-meta";
import { isValidDate } from "@/lib/vibration/parse";
import { requireVibrationEntry } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

/** Đặt lại "mức nền từ ngày" của một thiết bị sau sửa chữa / đại tu (R1 §6.2.3) — cần quyền nhập số đo.
 *  Body: { deviceId, baselineFrom: "YYYY-MM-DD" | "" } (rỗng = bỏ). Trả data: { deviceId, baselineFrom }. */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationEntry();
    const body = (await req.json().catch(() => null)) as { deviceId?: string; baselineFrom?: string } | null;
    const deviceId = body?.deviceId;
    const from = (body?.baselineFrom ?? "").trim();
    if (!deviceId) return fail("Thiếu thiết bị", 400);
    if (from && !isValidDate(from)) return fail("Ngày không hợp lệ (YYYY-MM-DD)", 400);
    const dev = await prisma.vibrationDevice.findUnique({ where: { id: deviceId }, select: { id: true, name: true, machine: true } });
    if (!dev) return fail("Không tìm thấy thiết bị", 404);
    // Nguồn duy nhất: machine.lastOverhaul (cùng trường với màn Danh mục › Thông số máy).
    const machine = dev.machine && typeof dev.machine === "object" && !Array.isArray(dev.machine) ? (dev.machine as Record<string, unknown>) : {};
    await prisma.vibrationDevice.update({ where: { id: deviceId }, data: { machine: { ...machine, lastOverhaul: from } } });
    await metaDelete("baseline:" + deviceId);
    await audit(user.id, "UPDATE", "VibrationAnalysisBaseline", deviceId, `${dev.name}: mức nền từ ${from || "(bỏ)"}`);
    return ok({ deviceId, baselineFrom: from });
  });
}
