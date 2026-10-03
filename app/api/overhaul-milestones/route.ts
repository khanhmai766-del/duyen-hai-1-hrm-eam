import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { buildMilestoneSchedule, OVERHAUL_CAMPAIGN, parseMilestoneInput, type MilestoneInput } from "@/lib/overhaul-milestones";

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

export async function GET() {
  return handle(async () => {
    await requireUser();
    const rows = await prisma.overhaulMilestone.findMany({
      where: { campaign: OVERHAUL_CAMPAIGN, deletedAt: null },
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    const items = rows.map((row) => ({
      ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    }));
    return ok(buildMilestoneSchedule(items));
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
