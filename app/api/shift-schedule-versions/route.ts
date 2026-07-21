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
  z.object({
    action: z.literal("GENERATE_RANGE"),
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
    monthCount: z.number().int().min(1).max(3),
    positionIds: z.array(z.string()).optional(),
    generatedFromDate: day.optional(),
    generationReason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.enum(["SUBMIT_REVIEW", "APPROVE", "PUBLISH"]), versionId: z.string().min(1) }),
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
          entries: { include: { positionConfig: { select: { name: true, positionType: true } } }, orderBy: [{ date: "asc" }, { shiftType: "asc" }] },
          createdBy: { select: { name: true } },
          basedOnVersion: { select: { id: true, versionNumber: true } },
        },
      });
      if (!version) return fail("Không tìm thấy phiên bản lịch", 404);
      const rawWarnings = Array.isArray(version.generationWarnings)
        ? version.generationWarnings as Array<{ date: string; positionId: string; shiftType: string; message: string }>
        : [];
      const positionIds = Array.from(new Set(version.entries.map((entry) => entry.positionConfigId)));
      const [staffing, warningPositions, printRotations] = await Promise.all([
        prisma.shiftStaffingAssignment.findMany({
          where: {
            positionId: { in: positionIds },
            startDate: { lte: new Date(Date.UTC(version.year, version.month, 0)) },
            OR: [{ endDate: null }, { endDate: { gte: new Date(Date.UTC(version.year, version.month - 1, 1)) } }],
          },
          include: { user: { select: { employeeId: true } } },
        }),
        prisma.shiftPositionConfig.findMany({
          where: { id: { in: Array.from(new Set(rawWarnings.map((warning) => warning.positionId))) } },
          select: { id: true, name: true },
        }),
        prisma.positionRotationAssignment.findMany({
          where: {
            positionConfigId: { in: positionIds },
            effectiveFrom: { lte: version.generatedFromDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: version.generatedFromDate } }],
          },
          include: {
            positionConfig: { select: { id: true, name: true } },
            rotationTemplate: { select: { id: true, code: true, name: true } },
          },
          orderBy: { effectiveFrom: "desc" },
        }),
      ]);
      const warningPositionNames = new Map(warningPositions.map((position) => [position.id, position.name]));
      const latestRotationByPosition = new Map<string, (typeof printRotations)[number]>();
      for (const rotation of printRotations)
        if (!latestRotationByPosition.has(rotation.positionConfigId)) latestRotationByPosition.set(rotation.positionConfigId, rotation);
      const rotationGroups = Array.from(latestRotationByPosition.values()).reduce<Array<{
        templateId: string; templateCode: string; templateName: string; positions: Array<{ id: string; name: string }>;
      }>>((groups, rotation) => {
        let group = groups.find((item) => item.templateId === rotation.rotationTemplate.id);
        if (!group) {
          group = { templateId: rotation.rotationTemplate.id, templateCode: rotation.rotationTemplate.code, templateName: rotation.rotationTemplate.name, positions: [] };
          groups.push(group);
        }
        group.positions.push(rotation.positionConfig);
        return groups;
      }, []);
      return ok({
        ...version,
        rotationGroups,
        generationWarnings: rawWarnings.map((warning) => ({
          ...warning,
          positionName: warningPositionNames.get(warning.positionId) ?? warning.positionId,
        })),
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
    if (input.action === "SUBMIT_REVIEW" || input.action === "APPROVE" || input.action === "PUBLISH") {
      const permission = input.action === "SUBMIT_REVIEW"
        ? "shift-schedule-generate"
        : input.action === "PUBLISH"
          ? "shift-schedule-publish"
          : "shift-schedule-approve";
      const levels = input.action === "SUBMIT_REVIEW" ? ["manage", "full"] as const : ["approve", "full"] as const;
      await requirePermissionLevel(user, permission, [...levels], "Không đủ quyền thực hiện bước phát hành lịch");
      const current = await prisma.shiftScheduleVersion.findUnique({ where: { id: input.versionId } });
      if (!current) return fail("Không tìm thấy phiên bản lịch", 404);
      if (input.action === "SUBMIT_REVIEW" && current.status !== "DRAFT")
        return fail("Chỉ bản nháp mới có thể gửi duyệt");
      if (input.action === "APPROVE" && current.status !== "REVIEW")
        return fail("Phiên bản phải ở trạng thái đang xem xét trước khi duyệt");
      if (input.action === "PUBLISH" && current.status !== "APPROVED")
        return fail("Chỉ phiên bản đã duyệt mới có thể công bố chính thức");
      if (
        input.action === "PUBLISH" &&
        Array.isArray(current.generationWarnings) &&
        (current.generationWarnings as Array<{ message?: string }>).some((warning) =>
          warning.message?.startsWith("An toàn chuyển ca"),
        )
      )
        return fail("Không thể công bố: lịch còn vi phạm quy tắc nghỉ giữa các ca");
      const updated = await prisma.$transaction(async (tx) => {
        if (input.action === "PUBLISH") {
          await tx.shiftScheduleVersion.updateMany({
            where: { unit: current.unit, year: current.year, month: current.month, status: "PUBLISHED", id: { not: current.id } },
            data: { status: "SUPERSEDED" },
          });
        }
        return tx.shiftScheduleVersion.update({
          where: { id: current.id },
          data: input.action === "SUBMIT_REVIEW"
            ? { status: "REVIEW" }
            : input.action === "APPROVE"
              ? { status: "APPROVED", approvedAt: new Date(), approvedById: user.id }
              : { status: "PUBLISHED", publishedAt: new Date() },
        });
      });
      await audit(user.id, input.action, "ShiftScheduleVersion", updated.id, `Chuyển lịch sang ${updated.status}`, {
        actorName: user.name, beforeData: current, afterData: updated, saveToAuditLog: true,
      });
      return ok(updated);
    }
    await requirePermissionLevel(
      user,
      input.action === "REGENERATE" || input.action === "REGENERATE_FROM_EVENT" ? "shift-schedule-regenerate" : "shift-schedule-generate",
      ["manage", "full"],
      "Không đủ quyền phát sinh lịch dự kiến",
    );
    if (input.action === "GENERATE_RANGE") {
      const generated = [];
      for (let offset = 0; offset < input.monthCount; offset += 1) {
        const target = new Date(Date.UTC(input.year, input.month - 1 + offset, 1));
        const targetYear = target.getUTCFullYear(), targetMonth = target.getUTCMonth() + 1;
        const base = await prisma.shiftScheduleVersion.findFirst({
          where: { unit: "Vận hành 1", year: targetYear, month: targetMonth },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        });
        generated.push(await generateShiftSchedule({
          year: targetYear,
          month: targetMonth,
          positionIds: input.positionIds,
          generatedFromDate: offset === 0 ? input.generatedFromDate : undefined,
          basedOnVersionId: base?.id ?? null,
          generationReason: `${input.generationReason} (${offset + 1}/${input.monthCount})`,
          actorId: user.id,
        }));
      }
      for (const version of generated)
        await audit(user.id, input.action, "ShiftScheduleVersion", version.id, version.generationReason, { actorName: user.name, afterData: version, saveToAuditLog: true });
      return ok(generated);
    }
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
    } else if (input.action === "GENERATE" || input.action === "REGENERATE") {
      version = await generateShiftSchedule({ ...input, actorId: user.id });
    } else {
      return fail("Thao tác lịch không hợp lệ");
    }
    await audit(user.id, input.action, "ShiftScheduleVersion", version.id, version.generationReason, {
      actorName: user.name,
      afterData: version,
      saveToAuditLog: true,
    });
    return ok(version);
  });
}
