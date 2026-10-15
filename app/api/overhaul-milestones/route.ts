import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { buildMilestoneSchedule, OVERHAUL_CAMPAIGN, parseMilestoneInput, type MilestoneInput } from "@/lib/overhaul-milestones";
import { ACTUAL_WRITERS } from "@/lib/overhaul-milestone-progress";

export const dynamic = "force-dynamic";

function dates(input: MilestoneInput) {
  return { ...input, startDate: new Date(`${input.startDate}T00:00:00Z`), endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null };
}

async function manager() {
  const user = await requireUser();
  requireRole(user, ["ADMIN"]);
  await requirePermissionLevel(user, "operation-events", ["manage", "full"], "Không đủ quyền quản lý mốc SCL");
  return user;
}

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await prisma.overhaulMilestone.findMany({
      where: { campaign: OVERHAUL_CAMPAIGN, deletedAt: null },
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    const logs = rows.length ? await prisma.overhaulMilestoneProgress.findMany({
      where: { milestoneId: { in: rows.map((row) => row.id) } }, orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }],
    }) : [];
    const userIds = [...new Set([...rows.map((row) => row.actualUpdatedById), ...logs.map((log) => log.createdById)].filter((id): id is string => Boolean(id)))];
    const names = new Map((userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
    const items = rows.map(({ actualUpdatedById, ...row }) => ({
      ...row, startDate: day(row.startDate)!, endDate: day(row.endDate),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      actualStart: day(row.actualStart), actualEnd: day(row.actualEnd), actualUpdatedAt: row.actualUpdatedAt?.toISOString() ?? null,
      actualUpdatedByName: actualUpdatedById ? names.get(actualUpdatedById) ?? null : null,
    }));
    return ok({
      ...buildMilestoneSchedule(items),
      logs: logs.map((log) => ({ id: log.id, milestoneId: log.milestoneId, reportDate: day(log.reportDate)!, actualStart: day(log.actualStart), actualEnd: day(log.actualEnd),
        percent: log.percent, note: log.note, createdByName: log.createdById ? names.get(log.createdById) ?? null : null, createdAt: log.createdAt.toISOString() })),
      canUpdateActual: (ACTUAL_WRITERS as readonly string[]).includes(user.role),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await manager();
    let input: MilestoneInput;
    try { input = parseMilestoneInput(await req.json()); }
    catch (error) { return fail(error instanceof Error ? error.message : "Dữ liệu không hợp lệ"); }
    const item = await prisma.overhaulMilestone.create({
      data: { ...dates(input), campaign: OVERHAUL_CAMPAIGN, sourceKey: `manual:${randomUUID()}`, createdById: user.id, updatedById: user.id },
    });
    await audit(user.id, "CREATE_OVERHAUL_MILESTONE", "OverhaulMilestone", item.id, item.title);
    return ok(item);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await manager();
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string" || !body.id || body.id.length > 100) return fail("Thiếu mã mốc hợp lệ");
    let input: MilestoneInput;
    try { input = parseMilestoneInput(body); }
    catch (error) { return fail(error instanceof Error ? error.message : "Dữ liệu không hợp lệ"); }
    const result = await prisma.overhaulMilestone.updateMany({
      where: { id: body.id, campaign: OVERHAUL_CAMPAIGN, deletedAt: null }, data: { ...dates(input), updatedById: user.id },
    });
    if (!result.count) return fail("Không tìm thấy mốc SCL", 404);
    await audit(user.id, "UPDATE_OVERHAUL_MILESTONE", "OverhaulMilestone", body.id, input.title);
    return ok({ id: body.id });
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await manager();
    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string" || !body.id || body.id.length > 100) return fail("Thiếu mã mốc hợp lệ");
    // Giữ dấu xoá để lần nạp nguồn tiếp theo không làm sống lại một mốc đã được người quản lý xoá.
    const result = await prisma.overhaulMilestone.updateMany({
      where: { id: body.id, campaign: OVERHAUL_CAMPAIGN, deletedAt: null }, data: { deletedAt: new Date(), updatedById: user.id },
    });
    if (!result.count) return fail("Không tìm thấy mốc SCL", 404);
    await audit(user.id, "DELETE_OVERHAUL_MILESTONE", "OverhaulMilestone", body.id);
    return ok({ id: body.id });
  });
}
