import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  WORK_TASK_INCLUDE,
  parseWorkTaskInput,
  requireWorkTaskManager,
  serializeWorkTask,
  workTaskAccess,
  workTaskVisibleWhere,
} from "@/lib/server/work-task";

export const dynamic = "force-dynamic";

/** "YYYY-MM" → khoảng [đầu tháng, đầu tháng sau) trên cột DATE. */
function monthRange(month: string | null) {
  const match = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { gte: new Date(Date.UTC(year, monthIndex, 1)), lt: new Date(Date.UTC(year, monthIndex + 1, 1)) };
}

/**
 * GET /api/work-tasks?month=YYYY-MM — không có month → tất cả.
 * Người có phạm vi "tất cả" (xem workTaskAccess) thấy mọi công việc; người khác chỉ thấy
 * công việc mình chủ trì hoặc do mình tạo. meta.viewAll báo phạm vi cho giao diện.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await workTaskAccess(user);
    const range = monthRange(req.nextUrl.searchParams.get("month"));
    const where: Prisma.WorkTaskWhereInput = {
      AND: [range ? { taskDate: range } : {}, workTaskVisibleWhere(access)],
    };
    const rows = await prisma.workTask.findMany({
      where,
      include: WORK_TASK_INCLUDE,
      orderBy: [{ taskDate: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });
    return ok(rows.map(serializeWorkTask), { viewAll: access.viewAll });
  });
}

/** POST /api/work-tasks — thêm công việc (Quản trị / Quản lý / KTV theo ma trận quyền). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireWorkTaskManager(user);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail("Dữ liệu không hợp lệ");
    const input = await parseWorkTaskInput(body, { partial: false });

    const row = await prisma.workTask.create({
      data: {
        taskDate: input.taskDate!,
        content: input.content!,
        director: input.director!,
        dueDate: input.dueDate ?? null,
        note: input.note ?? null,
        links: input.links ?? [],
        createdById: user.id,
        assignees: { create: (input.assigneeIds ?? []).map((userId) => ({ userId })) },
      },
      include: WORK_TASK_INCLUDE,
    });
    await audit(
      user.id,
      "CREATE_WORK_TASK",
      "WorkTask",
      row.id,
      auditDetailWithPosition(user, `Thêm công việc: ${row.content.slice(0, 120)}`)
    );
    return ok(serializeWorkTask(row));
  });
}
