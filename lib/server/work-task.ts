import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { assignedPermissionLevel } from "@/lib/rbac-permissions";
import {
  WORK_TASK_PERMISSION,
  isWorkTaskDirector,
  isWorkTaskLeadUser,
  isWorkTaskManagerPosition,
  parseGoogleLinks,
  parseWorkTaskDate,
  workTaskLeadPositionOf,
  type WorkTaskLink,
} from "@/lib/work-task";

const MAX_CONTENT = 5000;
const MAX_NOTE = 5000;
export const WORK_TASK_MAX_REPORT = 20000;
const MAX_ASSIGNEES = 30;

type PermissionUser = { id?: string; role: string; accessMode?: string };

type AccessUser = PermissionUser & {
  id: string;
  position?: string | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  secondaryPosition2?: string | null;
};

export type WorkTaskAccess = { userId: string; canManage: boolean; viewAll: boolean };

/**
 * Phạm vi công việc của một người:
 * - `viewAll`: quyền "work-task-manage" mức Toàn quyền (mặc định Quản trị, Quản lý) hoặc đang giữ
 *   cương vị Quản đốc / Phó quản đốc → thấy và sửa mọi công việc.
 * - Còn lại chỉ thấy công việc mình chủ trì hoặc do mình tạo; `canManage` (mức Quản lý) chỉ sửa/xoá
 *   được công việc do mình tạo.
 */
export async function workTaskAccess(user: AccessUser): Promise<WorkTaskAccess> {
  const level = await assignedPermissionLevel(user, WORK_TASK_PERMISSION);
  const director = [user.primaryPosition, user.position, user.secondaryPosition, user.secondaryPosition2].some(
    isWorkTaskManagerPosition
  );
  return {
    userId: user.id,
    canManage: level === "manage" || level === "full",
    viewAll: level === "full" || director,
  };
}

/** Điều kiện Prisma cho danh sách công việc người này được thấy. */
export function workTaskVisibleWhere(access: WorkTaskAccess): Prisma.WorkTaskWhereInput {
  if (access.viewAll) return {};
  return { OR: [{ assignees: { some: { userId: access.userId } } }, { createdById: access.userId }] };
}

export function canSeeWorkTask(access: WorkTaskAccess, task: { createdById: string; assigneeIds: string[] }) {
  return access.viewAll || task.createdById === access.userId || task.assigneeIds.includes(access.userId);
}

/** Sửa/xoá cả công việc (nội dung, ngày, chỉ đạo, chủ trì). */
export function canEditWorkTask(access: WorkTaskAccess, task: { createdById: string }) {
  return access.canManage && (access.viewAll || task.createdById === access.userId);
}

export async function requireWorkTaskManager(user: PermissionUser) {
  if (!(await hasPermissionLevel(user, WORK_TASK_PERMISSION, ["manage", "full"]))) {
    throw fail("Không đủ quyền quản lý công việc", 403);
  }
}

export const WORK_TASK_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  assignees: {
    select: {
      user: {
        select: { id: true, name: true, position: true, secondaryPosition: true, secondaryPosition2: true },
      },
    },
  },
} satisfies Prisma.WorkTaskInclude;

type WorkTaskRow = Prisma.WorkTaskGetPayload<{ include: typeof WORK_TASK_INCLUDE }>;

/** Làm phẳng chủ trì về { id, name, position } cho client. */
export function serializeWorkTask(row: WorkTaskRow) {
  const { assignees, ...rest } = row;
  return {
    ...rest,
    links: Array.isArray(row.links) ? (row.links as unknown as WorkTaskLink[]) : [],
    assignees: assignees
      .map(({ user }) => ({ id: user.id, name: user.name, position: workTaskLeadPositionOf(user) }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi")),
  };
}

export type WorkTaskInput = {
  taskDate?: Date;
  content?: string;
  director?: string;
  dueDate?: Date | null;
  note?: string | null;
  links?: WorkTaskLink[];
  assigneeIds?: string[];
};

function optionalText(value: unknown, max: number, label: string) {
  if (value == null) return null;
  if (typeof value !== "string") throw fail(`${label} không hợp lệ`);
  const text = value.trim();
  if (text.length > max) throw fail(`${label} quá dài (tối đa ${max} ký tự)`);
  return text || null;
}

/**
 * Kiểm dữ liệu thêm/sửa. `partial` = chỉ kiểm trường được gửi (PUT).
 * `current` dùng để so ngày hoàn thành với ngày giao khi chỉ đổi một trong hai.
 */
export async function parseWorkTaskInput(
  body: Record<string, unknown>,
  options: { partial: boolean; current?: { taskDate: Date; dueDate: Date | null } }
): Promise<WorkTaskInput> {
  const { partial } = options;
  const has = (key: string) => !partial || body[key] !== undefined;
  const input: WorkTaskInput = {};

  if (has("taskDate")) {
    const date = parseWorkTaskDate(body.taskDate);
    if (!date) throw fail("Chọn ngày giao việc");
    input.taskDate = date;
  }
  if (has("content")) {
    const content = optionalText(body.content, MAX_CONTENT, "Nội dung công việc");
    if (!content) throw fail("Nhập nội dung công việc");
    input.content = content;
  }
  if (has("director")) {
    if (!isWorkTaskDirector(body.director)) throw fail("Chọn người chỉ đạo");
    input.director = body.director;
  }
  if (has("dueDate")) {
    const raw = body.dueDate;
    if (raw == null || raw === "") input.dueDate = null;
    else {
      const date = parseWorkTaskDate(raw);
      if (!date) throw fail("Thời gian hoàn thành không hợp lệ");
      input.dueDate = date;
    }
  }
  if (has("note")) input.note = optionalText(body.note, MAX_NOTE, "Ghi chú");
  if (has("links")) {
    const parsed = parseGoogleLinks(body.links);
    if ("error" in parsed) throw fail(parsed.error);
    input.links = parsed.links;
  }
  if (has("assigneeIds")) {
    const raw = body.assigneeIds;
    if (!Array.isArray(raw)) throw fail("Danh sách chủ trì không hợp lệ");
    const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && id.trim() !== ""))];
    if (ids.length === 0) throw fail("Chọn ít nhất một người chủ trì");
    if (ids.length > MAX_ASSIGNEES) throw fail(`Tối đa ${MAX_ASSIGNEES} người chủ trì`);
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, position: true, secondaryPosition: true, secondaryPosition2: true },
    });
    if (users.length !== ids.length) throw fail("Có người chủ trì không tồn tại hoặc đã nghỉ");
    const invalid = users.filter((user) => !isWorkTaskLeadUser(user));
    if (invalid.length) {
      throw fail(
        `Không chọn Quản đốc / Phó quản đốc làm chủ trì: ${invalid.map((user) => user.name).join(", ")}`
      );
    }
    input.assigneeIds = ids;
  }

  const taskDate = input.taskDate ?? options.current?.taskDate;
  const dueDate = input.dueDate !== undefined ? input.dueDate : options.current?.dueDate;
  if (taskDate && dueDate && dueDate.getTime() < taskDate.getTime()) {
    throw fail("Thời gian hoàn thành không được trước ngày giao việc");
  }
  return input;
}
