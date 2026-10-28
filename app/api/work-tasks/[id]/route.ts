import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  WORK_TASK_INCLUDE,
  WORK_TASK_MAX_REPORT,
  canEditWorkTask,
  canSeeWorkTask,
  parseWorkTaskInput,
  requireWorkTaskManager,
  serializeWorkTask,
  workTaskAccess,
} from "@/lib/server/work-task";

export const dynamic = "force-dynamic";

/**
 * PUT /api/work-tasks/:id
 * - `action: "REPORT"` + `report` (+ tuỳ chọn `note`, `links`): ghi Báo cáo thực hiện và gắn ghi chú.
 *   Người chủ trì của chính dòng này, hoặc người sửa được cả công việc (canEditWorkTask).
 * - Còn lại: sửa các trường được gửi — người có phạm vi "tất cả", hoặc người tạo có quyền quản lý.
 *   Riêng Quản trị (ADMIN) gửi kèm được `report` để sửa báo cáo thực hiện ngay trong form này.
 * Người không được thấy công việc nhận 404 (không lộ là công việc có tồn tại).
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail("Dữ liệu không hợp lệ");

    const existing = await prisma.workTask.findUnique({
      where: { id },
      select: {
        id: true,
        taskDate: true,
        dueDate: true,
        createdById: true,
        report: true,
        assignees: { select: { userId: true } },
      },
    });
    const access = await workTaskAccess(user);
    const assigneeIds = existing?.assignees.map((assignee) => assignee.userId) ?? [];
    if (!existing || !canSeeWorkTask(access, { createdById: existing.createdById, assigneeIds })) {
      return fail("Không tìm thấy công việc", 404);
    }
    const canEdit = canEditWorkTask(access, existing);

    if (body.action === "REPORT") {
      const isAssignee = assigneeIds.includes(user.id);
      if (!isAssignee && !canEdit) {
        return fail("Chỉ người chủ trì hoặc người quản lý công việc mới ghi được báo cáo", 403);
      }
      if (body.report != null && typeof body.report !== "string") return fail("Báo cáo không hợp lệ");
      const report = String(body.report ?? "").trim();
      if (report.length > WORK_TASK_MAX_REPORT) {
        return fail(`Báo cáo quá dài (tối đa ${WORK_TASK_MAX_REPORT} ký tự)`);
      }
      // Người chủ trì được gắn ghi chú + link cùng lúc ghi báo cáo. Chỉ kiểm trường được gửi;
      // các trường khác của công việc (nội dung, ngày, chỉ đạo, chủ trì) không đổi được qua nhánh này.
      const extra = await parseWorkTaskInput(
        { note: body.note, links: body.links },
        { partial: true, current: { taskDate: existing.taskDate, dueDate: existing.dueDate } }
      );
      const row = await prisma.workTask.update({
        where: { id },
        data: {
          report: report || null,
          reportUpdatedAt: new Date(),
          reportUpdatedById: user.id,
          ...(extra.note !== undefined ? { note: extra.note } : {}),
          ...(extra.links !== undefined ? { links: extra.links } : {}),
        },
        include: WORK_TASK_INCLUDE,
      });
      await audit(
        user.id,
        "REPORT_WORK_TASK",
        "WorkTask",
        id,
        auditDetailWithPosition(user, "Cập nhật báo cáo thực hiện / ghi chú")
      );
      return ok(serializeWorkTask(row));
    }

    await requireWorkTaskManager(user);
    if (!canEdit) return fail("Chỉ sửa được công việc do bạn tạo", 403);

    // Quản trị sửa luôn báo cáo thực hiện trong form Sửa công việc. Chỉ ghi khi nội dung thật sự đổi
    // để không đè người/thời điểm cập nhật của người chủ trì.
    let reportData: { report: string | null; reportUpdatedAt: Date; reportUpdatedById: string } | null = null;
    if (body.report !== undefined) {
      if (user.role !== "ADMIN") return fail("Chỉ Quản trị mới sửa được báo cáo trong form này", 403);
      if (body.report !== null && typeof body.report !== "string") return fail("Báo cáo không hợp lệ");
      const report = String(body.report ?? "").trim();
      if (report.length > WORK_TASK_MAX_REPORT) {
        return fail(`Báo cáo quá dài (tối đa ${WORK_TASK_MAX_REPORT} ký tự)`);
      }
      if ((existing.report ?? "") !== report) {
        reportData = { report: report || null, reportUpdatedAt: new Date(), reportUpdatedById: user.id };
      }
    }

    const input = await parseWorkTaskInput(body, {
      partial: true,
      current: { taskDate: existing.taskDate, dueDate: existing.dueDate },
    });
    const { assigneeIds: nextAssigneeIds, ...fields } = input;

    const row = await prisma.$transaction(async (tx) => {
      if (nextAssigneeIds) {
        await tx.workTaskAssignee.deleteMany({ where: { taskId: id } });
        await tx.workTaskAssignee.createMany({ data: nextAssigneeIds.map((userId) => ({ taskId: id, userId })) });
      }
      return tx.workTask.update({ where: { id }, data: { ...fields, ...reportData }, include: WORK_TASK_INCLUDE });
    });
    await audit(
      user.id,
      "UPDATE_WORK_TASK",
      "WorkTask",
      id,
      auditDetailWithPosition(user, reportData ? "Sửa công việc (kèm báo cáo thực hiện)" : "Sửa công việc")
    );
    return ok(serializeWorkTask(row));
  });
}

/** DELETE /api/work-tasks/:id — người có phạm vi "tất cả", hoặc người tạo có quyền quản lý. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return handle(async () => {
    const user = await requireUser();
    await requireWorkTaskManager(user);
    const existing = await prisma.workTask.findUnique({
      where: { id },
      select: { content: true, createdById: true, assignees: { select: { userId: true } } },
    });
    const access = await workTaskAccess(user);
    const assigneeIds = existing?.assignees.map((assignee) => assignee.userId) ?? [];
    if (!existing || !canSeeWorkTask(access, { createdById: existing.createdById, assigneeIds })) {
      return fail("Không tìm thấy công việc", 404);
    }
    if (!canEditWorkTask(access, existing)) return fail("Chỉ xoá được công việc do bạn tạo", 403);
    await prisma.workTask.delete({ where: { id } });
    await audit(
      user.id,
      "DELETE_WORK_TASK",
      "WorkTask",
      id,
      auditDetailWithPosition(user, `Xoá công việc: ${existing.content.slice(0, 120)}`)
    );
    return ok({ id });
  });
}
