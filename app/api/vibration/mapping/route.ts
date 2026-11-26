import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok } from "@/lib/api";
import { runAutoMapping } from "@/lib/vibration/mapping";
import { requireVibrationManage, toDeviceDto } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

/** Cập nhật ánh xạ thiết bị độ rung ↔ cây thiết bị. Cần quyền vibration-manage.
 *  Body: { action: "set", deviceId, equipmentSeq }  gán tay (mapStatus = confirmed)
 *      | { action: "confirm", deviceId }            xác nhận ánh xạ tự động hiện có
 *      | { action: "clear", deviceId }              bỏ gán (mapStatus = none)
 *      | { action: "useSuggestion", deviceId }      dùng gợi ý tốt nhất (confirmed)
 *      | { action: "bulkSuggestions", minScore, deviceIds? } xác nhận hàng loạt gợi ý có điểm ≥ minScore (chỉ thiết bị chưa gán/auto; deviceIds = giới hạn theo bộ lọc đang xem)
 *      | { action: "auto" }                         chạy ánh xạ tự động cho mọi thiết bị đang hoạt động chưa xác nhận
 *  Trả data: VibrationDeviceDto (set/confirm/clear) hoặc thống kê { considered, auto, none, skippedConfirmed } (auto). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationManage();
    const body = (await req.json().catch(() => null)) as { action?: string; deviceId?: string; equipmentSeq?: string; minScore?: number; deviceIds?: string[] } | null;
    if (!body?.action) return fail("Thiếu thao tác (action)", 400);

    if (body.action === "auto") {
      const { samples, ...stats } = await runAutoMapping(prisma);
      void samples;
      await audit(user.id, "VIBRATION_AUTO_MAP", "VibrationDevice", undefined, `auto ${stats.auto}, chưa gán ${stats.none}, bỏ qua đã xác nhận ${stats.skippedConfirmed}`);
      return ok(stats);
    }

    if (body.action === "bulkSuggestions") {
      const min = Number(body.minScore);
      if (!Number.isFinite(min) || min < 0 || min > 1) return fail("Điểm tối thiểu phải từ 0 đến 1", 400);
      const ids = Array.isArray(body.deviceIds) ? body.deviceIds.filter((x) => typeof x === "string").slice(0, 2000) : null;
      const res = await prisma.$executeRaw`UPDATE "VibrationDevice" SET "equipmentSeq" = "suggestSeq", "mapStatus" = 'confirmed', "mapScore" = NULL, "mapNote" = NULL, "suggestSeq" = NULL, "suggestScore" = NULL, "updatedAt" = NOW()
        WHERE "mapStatus" <> 'confirmed' AND "suggestSeq" IS NOT NULL AND "suggestScore" >= ${min} AND "active" = true
        AND EXISTS (SELECT 1 FROM "EquipmentNode" n WHERE n."seq" = "VibrationDevice"."suggestSeq")
        AND (${ids === null} OR "id" = ANY(${ids ?? []}::text[]))`;
      await audit(user.id, "VIBRATION_BULK_SUGGESTIONS", "VibrationDevice", undefined, `điểm ≥ ${min}: xác nhận ${res} gợi ý`);
      return ok({ confirmed: Number(res) });
    }

    const device = body.deviceId ? await prisma.vibrationDevice.findUnique({ where: { id: body.deviceId } }) : null;
    if (!device) return fail("Không tìm thấy thiết bị độ rung", 404);

    let node: { seq: string; name: string } | null = null;
    let data;
    if (body.action === "set") {
      node = body.equipmentSeq ? await prisma.equipmentNode.findUnique({ where: { seq: body.equipmentSeq }, select: { seq: true, name: true } }) : null;
      if (!node) return fail("Không tìm thấy thiết bị trong cây thiết bị", 404);
      data = { equipmentSeq: node.seq, mapStatus: "confirmed", mapScore: null, mapNote: null, suggestSeq: null, suggestScore: null };
    } else if (body.action === "useSuggestion") {
      node = device.suggestSeq ? await prisma.equipmentNode.findUnique({ where: { seq: device.suggestSeq }, select: { seq: true, name: true } }) : null;
      if (!node) return fail("Thiết bị không có gợi ý hợp lệ", 400);
      data = { equipmentSeq: node.seq, mapStatus: "confirmed", mapScore: null, mapNote: null, suggestSeq: null, suggestScore: null };
    } else if (body.action === "confirm") {
      if (!device.equipmentSeq) return fail("Thiết bị chưa được gán nên không thể xác nhận", 400);
      data = { mapStatus: "confirmed", suggestSeq: null, suggestScore: null };
    } else if (body.action === "clear") {
      data = { equipmentSeq: null, mapStatus: "none", mapScore: null, mapNote: null };
    } else return fail("Thao tác không hợp lệ", 400);

    const updated = await prisma.vibrationDevice.update({ where: { id: device.id }, data });
    await audit(user.id, `VIBRATION_MAP_${body.action.toUpperCase()}`, "VibrationDevice", device.id, `${device.name} → ${updated.equipmentSeq ?? "(bỏ gán)"}`);
    if (!node && updated.equipmentSeq) {
      node = await prisma.equipmentNode.findUnique({ where: { seq: updated.equipmentSeq }, select: { seq: true, name: true } });
    }
    return ok(toDeviceDto(updated, node?.name ?? null));
  });
}
