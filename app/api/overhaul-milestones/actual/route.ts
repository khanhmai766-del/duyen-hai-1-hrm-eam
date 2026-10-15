import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { OVERHAUL_CAMPAIGN, vietnamDate } from "@/lib/overhaul-milestones";
import { ACTUAL_WRITERS, parseActualInput, type ActualInput } from "@/lib/overhaul-milestone-progress";

export const dynamic = "force-dynamic";

const asDate = (value: string | null) => value ? new Date(`${value}T00:00:00Z`) : null;

/**
 * PUT — cập nhật thực tế một mốc SCL S2 (ngày bắt đầu / hoàn thành, % đã làm, ghi chú) và thêm một dòng nhật ký để dựng
 * đường S thực tế. Không sửa kế hoạch (tên, ngày kế hoạch) — việc đó vẫn ở /api/overhaul-milestones, chỉ ADMIN.
 */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, [...ACTUAL_WRITERS]);
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string" || !body.id || body.id.length > 100) return fail("Thiếu mã mốc hợp lệ");
    const item = await prisma.overhaulMilestone.findFirst({ where: { id: body.id, campaign: OVERHAUL_CAMPAIGN, deletedAt: null } });
    if (!item) return fail("Không tìm thấy mốc SCL", 404);
    let input: ActualInput;
    try {
      input = parseActualInput(body, { startDate: item.startDate.toISOString().slice(0, 10), endDate: item.endDate?.toISOString().slice(0, 10) ?? null }, vietnamDate());
    } catch (error) { return fail(error instanceof Error ? error.message : "Dữ liệu không hợp lệ"); }
    const now = new Date();
    await prisma.$transaction([
      prisma.overhaulMilestone.update({ where: { id: item.id }, data: {
        actualStart: asDate(input.actualStart), actualEnd: asDate(input.actualEnd), actualPercent: input.percent, actualNote: input.note,
        actualUpdatedById: user.id, actualUpdatedAt: now,
      } }),
      prisma.overhaulMilestoneProgress.create({ data: {
        milestoneId: item.id, reportDate: asDate(input.reportDate)!, actualStart: asDate(input.actualStart), actualEnd: asDate(input.actualEnd),
        percent: input.percent, note: input.note, createdById: user.id, createdAt: now,
      } }),
    ]);
    await audit(user.id, "UPDATE_OVERHAUL_MILESTONE_ACTUAL", "OverhaulMilestone", item.id,
      `${item.title} · ${input.actualEnd ? `hoàn thành ${input.actualEnd}` : `${input.percent}%`}${input.actualStart ? ` · bắt đầu ${input.actualStart}` : ""}`);
    return ok({ id: item.id });
  });
}
