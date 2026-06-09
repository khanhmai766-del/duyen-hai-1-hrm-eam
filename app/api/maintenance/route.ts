import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { addDays, pmDueStatus } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

const PLAN_INCLUDE = {
  device: { select: { id: true, code: true, name: true, category: true, location: true } },
  assignee: { select: { id: true, name: true, position: true } },
  _count: { select: { records: true } },
} satisfies Prisma.MaintenancePlanInclude;

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const deviceId = sp.get("deviceId");
    const due = sp.get("due"); // OVERDUE | DUE_SOON | OK | ALL
    const active = sp.get("active"); // "false" to include inactive

    const where: Prisma.MaintenancePlanWhereInput = {};
    if (active !== "false") where.isActive = true;
    if (deviceId) where.deviceId = deviceId;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { device: { is: { code: { contains: q, mode: "insensitive" } } } },
        { device: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const plans = await prisma.maintenancePlan.findMany({
      where,
      orderBy: { nextDueAt: "asc" },
      include: PLAN_INCLUDE,
    });

    // Due-bucket counts over the (search-filtered) set, before the `due` filter.
    const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
    for (const p of plans) counts[pmDueStatus(p.nextDueAt)]++;

    const filtered = due && due !== "ALL" ? plans.filter((p) => pmDueStatus(p.nextDueAt) === due) : plans;

    return ok(filtered, { total: filtered.length, counts });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();

    if (!body.deviceId || !body.title || !body.intervalDays) {
      return fail("Thiếu thông tin bắt buộc (thiết bị, tiêu đề, chu kỳ)");
    }
    const intervalDays = Number(body.intervalDays);
    if (!Number.isFinite(intervalDays) || intervalDays < 1) {
      return fail("Chu kỳ phải là số ngày hợp lệ (≥ 1)");
    }

    const device = await prisma.device.findUnique({ where: { id: body.deviceId } });
    if (!device) return fail("Không tìm thấy thiết bị", 404);

    // nextDue: dùng giá trị người dùng nhập, nếu trống thì tính từ hôm nay + chu kỳ.
    const nextDueAt = body.nextDueAt ? new Date(body.nextDueAt) : addDays(new Date(), intervalDays);

    const plan = await prisma.maintenancePlan.create({
      data: {
        deviceId: body.deviceId,
        title: body.title,
        description: body.description || null,
        intervalDays,
        priority: body.priority || "MEDIUM",
        assigneeId: body.assigneeId || null,
        nextDueAt,
        lastDoneAt: body.lastDoneAt ? new Date(body.lastDoneAt) : null,
        isActive: body.isActive ?? true,
        createdById: user.id,
      },
      include: PLAN_INCLUDE,
    });
    await audit(user.id, "CREATE_MAINTENANCE", "MaintenancePlan", plan.id, `${device.code} — ${plan.title}`);
    return ok(plan);
  });
}
