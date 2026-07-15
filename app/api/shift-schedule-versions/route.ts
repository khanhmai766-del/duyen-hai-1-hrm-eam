import { z } from "zod";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { generateNextMonthDraft, generateShiftSchedule } from "@/lib/shift-schedule-generator";

export const dynamic = "force-dynamic";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["GENERATE", "REGENERATE"]),
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
    positionIds: z.array(z.string()).optional(),
    generatedFromDate: day.optional(),
    basedOnVersionId: z.string().nullable().optional(),
    generationReason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("GENERATE_NEXT_MONTH"), generationReason: z.string().trim().min(3).max(500).optional() }),
  z.object({ action: z.literal("REGENERATE_FROM_EVENT"), eventId: z.string().min(1), basedOnVersionId: z.string().nullable().optional() }),
]);

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "shift-schedule-view", ["read", "manage", "full"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      const version = await prisma.shiftScheduleVersion.findUnique({
        where: { id },
        include: {
          entries: { include: { positionConfig: { select: { name: true } } }, orderBy: [{ date: "asc" }, { shiftType: "asc" }] },
          createdBy: { select: { name: true } },
          basedOnVersion: { select: { id: true, versionNumber: true } },
        },
      });
      if (!version) return fail("Không tìm thấy phiên bản lịch", 404);
      const staffing = await prisma.shiftStaffingAssignment.findMany({
        where: {
          positionId: { in: Array.from(new Set(version.entries.map((entry) => entry.positionConfigId))) },
          startDate: { lte: new Date(Date.UTC(version.year, version.month, 0)) },
          OR: [{ endDate: null }, { endDate: { gte: new Date(Date.UTC(version.year, version.month - 1, 1)) } }],
        },
        include: { user: { select: { employeeId: true } } },
      });
      return ok({
        ...version,
        entries: version.entries.map((entry) => ({
          ...entry,
          crewCode:
            staffing.find(
              (assignment) =>
                assignment.positionId === entry.positionConfigId &&
                assignment.user.employeeId === entry.employeeId &&
                assignment.startDate <= entry.date &&
                (!assignment.endDate || assignment.endDate >= entry.date),
            )?.crewCode ?? null,
        })),
      });
    }
    const year = Number(searchParams.get("year")) || new Date().getFullYear();
    const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
    const [versions, positions, events] = await Promise.all([
      prisma.shiftScheduleVersion.findMany({
        where: { year, month },
        include: { _count: { select: { entries: true } }, createdBy: { select: { name: true } } },
        orderBy: { versionNumber: "desc" },
      }),
      prisma.shiftPositionConfig.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.staffingChangeEvent.findMany({
        where: { effectiveDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lte: new Date(Date.UTC(year, month, 0)) } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return ok({ versions, positions, events });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const parsed = inputSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const input = parsed.data;
    await requirePermissionLevel(
      user,
      input.action === "REGENERATE" || input.action === "REGENERATE_FROM_EVENT" ? "shift-schedule-regenerate" : "shift-schedule-generate",
      ["manage", "full"],
      "Không đủ quyền phát sinh lịch dự kiến",
    );
    let version;
    if (input.action === "GENERATE_NEXT_MONTH") {
      version = await generateNextMonthDraft(user.id, input.generationReason);
    } else if (input.action === "REGENERATE_FROM_EVENT") {
      const event = await prisma.staffingChangeEvent.findUnique({ where: { id: input.eventId } });
      if (!event) return fail("Không tìm thấy sự kiện thay đổi biên chế", 404);
      const positionIds = [event.sourcePositionId, event.targetPositionId].filter((id): id is string => !!id);
      version = await generateShiftSchedule({
        year: event.effectiveDate.getUTCFullYear(),
        month: event.effectiveDate.getUTCMonth() + 1,
        positionIds,
        generatedFromDate: event.effectiveDate.toISOString().slice(0, 10),
        basedOnVersionId: input.basedOnVersionId,
        generationReason: `Tạo lại theo thay đổi biên chế: ${event.reason}`,
        actorId: user.id,
      });
    } else {
      version = await generateShiftSchedule({ ...input, actorId: user.id });
    }
    await audit(user.id, input.action, "ShiftScheduleVersion", version.id, version.generationReason, {
      actorName: user.name,
      afterData: version,
      saveToAuditLog: true,
    });
    return ok(version);
  });
}
