import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { assignedPermissionLevel } from "@/lib/rbac-permissions";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";
const PERMISSION = "shift-staffing-manage";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hiệu lực không hợp lệ");
const reason = z
  .string()
  .trim()
  .min(3, "Vui lòng nhập lý do thay đổi")
  .max(500);
const stationCode = z.enum(["S1", "S2", "FLEX"]).nullable().optional();
const patternCode = z.enum(["MORNING", "AFTERNOON", "NIGHT", "OFF"]);
const baseAssignment = z.object({
  userId: z.string().min(1),
  positionId: z.string().min(1),
  crewCode: z.string().trim().max(20).nullable().optional(),
  phaseIndex: z.number().int().nonnegative().nullable().optional(),
  cycleStartDate: day.nullable().optional(),
  stationCode,
  assignmentType: z.enum([
    "OFFICIAL",
    "BACKUP",
    "TRAINING",
    "TEMPORARY",
    "ADMINISTRATIVE",
  ]),
  effectiveDate: day,
  endDate: day.nullable().optional(),
  reason,
  note: z.string().trim().max(500).nullable().optional(),
});
const bulkAssignment = baseAssignment.omit({
  userId: true,
  phaseIndex: true,
}).extend({
  userIds: z.array(z.string().min(1)).min(1, "Hãy chọn ít nhất một nhân sự").max(20),
});
const templateFields = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]+$/, "Mã mẫu chỉ gồm chữ in hoa, số và dấu gạch dưới")
    .max(50),
  name: z.string().trim().min(1).max(150),
  cycleLength: z.number().int().positive(),
  cyclePattern: z.array(patternCode).min(1),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  reason,
});
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CONFIGURE_POSITION"),
    name: z.string().trim().min(1).max(150),
    requiredMorningStaff: z.number().int().nonnegative(),
    requiredAfternoonStaff: z.number().int().nonnegative(),
    requiredNightStaff: z.number().int().nonnegative(),
    isActive: z.boolean().default(true),
    reason: z.string().trim().max(500).default(""),
  }),
  baseAssignment.extend({ action: z.literal("ASSIGN") }),
  bulkAssignment.extend({ action: z.literal("BULK_ASSIGN") }),
  baseAssignment.extend({
    action: z.literal("CHANGE"),
    assignmentId: z.string().min(1),
  }),
  z.object({
    action: z.literal("DETACH"),
    assignmentId: z.string().min(1),
    effectiveDate: day,
    reason,
  }),
  templateFields.extend({ action: z.literal("CREATE_ROTATION_TEMPLATE") }),
  templateFields.extend({
    action: z.literal("UPDATE_ROTATION_TEMPLATE"),
    templateId: z.string().min(1),
  }),
  z.object({
    action: z.literal("ASSIGN_POSITION_ROTATION"),
    positionConfigId: z.string().min(1),
    rotationTemplateId: z.string().min(1),
    effectiveFrom: day,
    effectiveTo: day.nullable().optional(),
    reason,
  }),
  z.object({
    action: z.literal("END_POSITION_ROTATION"),
    assignmentId: z.string().min(1),
    effectiveDate: day,
    reason,
  }),
]);

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
function previousDay(value: string) {
  const result = date(value);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}
function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
function snapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
function detail(reasonText: string, effectiveDate?: string) {
  return JSON.stringify({
    reason: reasonText,
    effectiveDate: effectiveDate ?? null,
  });
}
function coverageType(morning: number, afternoon: number, night: number) {
  return Math.max(morning, afternoon, night) > 1
    ? ("S1_S2" as const)
    : ("SINGLE" as const);
}

async function activeRotation(
  tx: Prisma.TransactionClient,
  positionId: string,
  at: Date,
) {
  return tx.positionRotationAssignment.findFirst({
    where: {
      positionConfigId: positionId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    },
    include: { rotationTemplate: true },
    orderBy: { effectiveFrom: "desc" },
  });
}

async function ensureValidAssignment(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof baseAssignment>,
  excludeId?: string,
) {
  const startDate = date(data.effectiveDate),
    endDate = data.endDate ? date(data.endDate) : null,
    cycleStartDate = data.cycleStartDate ? date(data.cycleStartDate) : null;
  if (endDate && startDate > endDate)
    throw fail("Ngày bắt đầu không được sau ngày kết thúc");
  const position = await tx.shiftPositionConfig.findUnique({
    where: { id: data.positionId },
  });
  if (
    !position?.isActive ||
    position.requiredMorningStaff === null ||
    position.requiredAfternoonStaff === null ||
    position.requiredNightStaff === null ||
    !position.positionType
  )
    throw fail("Cương vị chưa được cấu hình hoặc đã ngừng sử dụng");
  if (position.positionType === "SINGLE" && data.stationCode)
    throw fail("Cương vị một vị trí không được lưu S1, S2 hoặc FLEX");
  const rotation = await activeRotation(tx, data.positionId, startDate);
  if (cycleStartDate && cycleStartDate > startDate)
    throw fail("Ngày bắt đầu chu kỳ không được sau ngày hiệu lực biên chế");
  const resolvedPhaseIndex = cycleStartDate && rotation
    ? daysBetween(cycleStartDate, startDate) % rotation.rotationTemplate.cycleLength
    : data.phaseIndex;
  if (cycleStartDate && !rotation)
    throw fail("Cương vị chưa có mẫu xoay ca áp dụng tại ngày hiệu lực");
  if (resolvedPhaseIndex !== null && resolvedPhaseIndex !== undefined) {
    if (rotation && resolvedPhaseIndex >= rotation.rotationTemplate.cycleLength)
      throw fail(
        `Bước chu kỳ phải nằm trong ${rotation.rotationTemplate.cycleLength} bước của mẫu đang áp dụng`,
      );
  }
  if (data.assignmentType === "OFFICIAL") {
    const overlapRange = {
      startDate: { lte: endDate ?? new Date("9999-12-31T00:00:00.000Z") },
      OR: [{ endDate: null }, { endDate: { gte: startDate } }],
    };
    const overlap = await tx.shiftStaffingAssignment.findFirst({
      where: {
        userId: data.userId,
        assignmentType: "OFFICIAL",
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...overlapRange,
      },
    });
    if (overlap)
      throw fail(
        "Nhân sự đã có phân công chính thức chồng lấn trong thời gian này",
      );
    if (resolvedPhaseIndex !== null && resolvedPhaseIndex !== undefined) {
      const samePhases = await tx.shiftStaffingAssignment.findMany({
        where: {
          positionId: data.positionId,
          assignmentType: "OFFICIAL",
          phaseIndex: resolvedPhaseIndex,
          ...(excludeId ? { id: { not: excludeId } } : {}),
          ...overlapRange,
        },
      });
      if (samePhases.some((samePhase) =>
        (position.positionType === "SINGLE" ||
          !data.stationCode ||
          samePhase.stationCode === data.stationCode) &&
        samePhase.crewCode !== data.crewCode
      ))
        throw fail(
          "Hai kíp khác nhau không thể cùng bắt đầu tại một bước chu kỳ trong thời gian này",
        );
    }
  }
  return { position, startDate, endDate, cycleStartDate, phaseIndex: resolvedPhaseIndex ?? null };
}

async function syncCrewRotation(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof baseAssignment>,
  actorId: string,
) {
  if (!data.crewCode || !data.cycleStartDate) return;
  const at = date(data.effectiveDate);
  const rotation = await activeRotation(tx, data.positionId, at);
  if (!rotation) return;
  const current = await tx.crewRotationConfig.findFirst({
    where: {
      positionConfigId: data.positionId,
      crewCode: data.crewCode,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const values = {
    rotationTemplateId: rotation.rotationTemplateId,
    cycleStartDate: date(data.cycleStartDate),
    reason: data.reason,
    updatedById: actorId,
  };
  if (current) {
    await tx.crewRotationConfig.update({ where: { id: current.id }, data: values });
  } else {
    await tx.crewRotationConfig.create({
      data: {
        positionConfigId: data.positionId,
        crewCode: data.crewCode,
        effectiveFrom: at,
        effectiveTo: data.endDate ? date(data.endDate) : null,
        createdById: actorId,
        ...values,
      },
    });
  }
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      PERMISSION,
      ["read", "manage", "full"],
      "Không đủ quyền xem biên chế trực ca",
    );
    const [
      configs,
      users,
      assignments,
      rotationTemplates,
      positionRotations,
      permissionLevel,
    ] = await Promise.all([
      prisma.shiftPositionConfig.findMany({ orderBy: { name: "asc" } }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, employeeId: true, name: true, position: true },
        orderBy: { name: "asc" },
      }),
      prisma.shiftStaffingAssignment.findMany({
        include: {
          user: { select: { id: true, employeeId: true, name: true } },
          position: { select: { id: true, name: true, positionType: true } },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.rotationTemplate.findMany({
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
      }),
      prisma.positionRotationAssignment.findMany({
        include: {
          rotationTemplate: true,
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
        },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      assignedPermissionLevel(user, PERMISSION),
    ]);
    const configuredNames = new Set(
      configs.map((item) => normalizeText(item.name)),
    );
    const unconfigured = Array.from(
      new Set(
        users
          .map((item) => item.position?.trim())
          .filter(
            (item): item is string =>
              !!item && !configuredNames.has(normalizeText(item)),
          ),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
    return ok({
      positions: [
        ...configs,
        ...unconfigured.map((name) => ({
          id: null,
          name,
          requiredPerShift: null,
          requiredMorningStaff: null,
          requiredAfternoonStaff: null,
          requiredNightStaff: null,
          positionType: null,
          isActive: true,
        })),
      ],
      assignments,
      users,
      rotationTemplates,
      positionRotations,
      permissionLevel,
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireUser();
    const parsed = inputSchema.safeParse(await req.json());
    if (!parsed.success)
      throw fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const input = parsed.data;
    if (input.action === "CONFIGURE_POSITION") {
      await requirePermissionLevel(
        actor,
        PERMISSION,
        ["full"],
        "Chỉ người có toàn quyền mới được cấu hình cương vị",
      );
      if (
        input.requiredMorningStaff +
          input.requiredAfternoonStaff +
          input.requiredNightStaff <=
        0
      )
        throw fail("Ít nhất một ca phải có nhu cầu lớn hơn 0");
      const before = await prisma.shiftPositionConfig.findUnique({
        where: { name: input.name },
      });
      if (before && input.reason.trim().length < 3)
        throw fail("Vui lòng nhập lý do thay đổi (ít nhất 3 ký tự)");
      const equal =
        input.requiredMorningStaff === input.requiredAfternoonStaff &&
        input.requiredMorningStaff === input.requiredNightStaff;
      const legacy =
        equal && [1, 2].includes(input.requiredMorningStaff)
          ? input.requiredMorningStaff
          : null;
      const nextPositionType = coverageType(
        input.requiredMorningStaff,
        input.requiredAfternoonStaff,
        input.requiredNightStaff,
      );
      if (before && nextPositionType === "SINGLE") {
        const incompatible = await prisma.shiftStaffingAssignment.findFirst({
          where: {
            positionId: before.id,
            stationCode: { not: null },
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          },
        });
        if (incompatible)
          throw fail(
            "Hãy kết thúc hoặc chuyển các phân công S1/S2/FLEX trước khi đổi cương vị sang một vị trí",
          );
      }
      const values = {
        requiredMorningStaff: input.requiredMorningStaff,
        requiredAfternoonStaff: input.requiredAfternoonStaff,
        requiredNightStaff: input.requiredNightStaff,
        requiredPerShift: legacy,
        positionType: nextPositionType,
        isActive: input.isActive,
        updatedById: actor.id,
      };
      const after = await prisma.shiftPositionConfig.upsert({
        where: { name: input.name },
        create: { name: input.name, ...values, createdById: actor.id },
        update: values,
      });
      await audit(
        actor.id,
        "UPDATE_SHIFT_COVERAGE_REQUIREMENT",
        "ShiftPositionConfig",
        after.id,
        detail(input.reason || "Khởi tạo cấu hình"),
        {
          actorName: actor.name,
          beforeData: snapshot(before),
          afterData: snapshot(after),
          saveToAuditLog: true,
        },
      );
      return ok(after);
    }
    if (
      input.action === "CREATE_ROTATION_TEMPLATE" ||
      input.action === "UPDATE_ROTATION_TEMPLATE"
    ) {
      await requirePermissionLevel(
        actor,
        PERMISSION,
        ["full"],
        "Chỉ người có toàn quyền mới được quản lý mẫu xoay ca",
      );
      if (input.cycleLength !== input.cyclePattern.length)
        throw fail("Độ dài chu kỳ phải bằng số phần tử trong mẫu");
      const before =
        input.action === "UPDATE_ROTATION_TEMPLATE"
          ? await prisma.rotationTemplate.findUnique({
              where: { id: input.templateId },
            })
          : null;
      const values = {
        code: input.code,
        name: input.name,
        cycleLength: input.cycleLength,
        cyclePattern: input.cyclePattern,
        description: input.description ?? null,
        isActive: input.isActive,
        updatedById: actor.id,
      };
      const after =
        input.action === "CREATE_ROTATION_TEMPLATE"
          ? await prisma.rotationTemplate.create({
              data: { ...values, createdById: actor.id },
            })
          : await prisma.rotationTemplate.update({
              where: { id: input.templateId },
              data: values,
            });
      await audit(
        actor.id,
        input.action,
        "RotationTemplate",
        after.id,
        detail(input.reason),
        {
          actorName: actor.name,
          beforeData: snapshot(before),
          afterData: snapshot(after),
          saveToAuditLog: true,
        },
      );
      return ok(after);
    }
    await requirePermissionLevel(
      actor,
      PERMISSION,
      ["manage", "full"],
      "Không đủ quyền thay đổi biên chế trực ca",
    );
    if (input.action === "ASSIGN_POSITION_ROTATION") {
      const from = date(input.effectiveFrom),
        to = input.effectiveTo ? date(input.effectiveTo) : null;
      if (to && from > to)
        throw fail("Ngày bắt đầu không được sau ngày kết thúc");
      const result = await prisma.$transaction(
        async (tx) => {
          const template = await tx.rotationTemplate.findUnique({
            where: { id: input.rotationTemplateId },
          });
          if (!template?.isActive)
            throw fail("Mẫu xoay ca không tồn tại hoặc đã ngừng sử dụng");
          const overlapping = await tx.positionRotationAssignment.findMany({
            where: {
              positionConfigId: input.positionConfigId,
              effectiveFrom: {
                lte: to ?? new Date("9999-12-31T00:00:00.000Z"),
              },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
            },
            orderBy: { effectiveFrom: "asc" },
          });
          let ended = null;
          if (
            overlapping.some(
              (item) =>
                item.effectiveFrom >= from ||
                (item.effectiveTo && item.effectiveTo >= from),
            )
          ) {
            const current = overlapping.find(
              (item) =>
                item.effectiveFrom < from &&
                (!item.effectiveTo || item.effectiveTo >= from),
            );
            if (!current || overlapping.length > 1)
              throw fail("Khoảng hiệu lực mẫu xoay ca bị chồng lấn");
            ended = await tx.positionRotationAssignment.update({
              where: { id: current.id },
              data: {
                effectiveTo: previousDay(input.effectiveFrom),
                isActive: false,
                updatedById: actor.id,
                reason: input.reason,
              },
            });
          }
          const created = await tx.positionRotationAssignment.create({
            data: {
              positionConfigId: input.positionConfigId,
              rotationTemplateId: input.rotationTemplateId,
              effectiveFrom: from,
              effectiveTo: to,
              reason: input.reason,
              isActive: !to,
              createdById: actor.id,
              updatedById: actor.id,
            },
          });
          return { created, ended };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await audit(
        actor.id,
        result.ended ? "CHANGE_POSITION_ROTATION" : "ASSIGN_POSITION_ROTATION",
        "PositionRotationAssignment",
        result.created.id,
        detail(input.reason, input.effectiveFrom),
        {
          actorName: actor.name,
          beforeData: snapshot(result.ended),
          afterData: snapshot(result.created),
          saveToAuditLog: true,
        },
      );
      return ok(result.created);
    }
    if (input.action === "END_POSITION_ROTATION") {
      const before = await prisma.positionRotationAssignment.findUnique({
        where: { id: input.assignmentId },
      });
      if (!before) throw fail("Không tìm thấy lịch sử áp dụng mẫu");
      if (date(input.effectiveDate) < before.effectiveFrom)
        throw fail("Ngày kết thúc không được trước ngày bắt đầu");
      const after = await prisma.$transaction((tx) =>
        tx.positionRotationAssignment.update({
          where: { id: input.assignmentId },
          data: {
            effectiveTo: date(input.effectiveDate),
            isActive: false,
            reason: input.reason,
            updatedById: actor.id,
          },
        }),
      );
      await audit(
        actor.id,
        "END_POSITION_ROTATION",
        "PositionRotationAssignment",
        after.id,
        detail(input.reason, input.effectiveDate),
        {
          actorName: actor.name,
          beforeData: snapshot(before),
          afterData: snapshot(after),
          saveToAuditLog: true,
        },
      );
      return ok(after);
    }
    if (input.action === "ASSIGN" || input.action === "BULK_ASSIGN") {
      const rows = input.action === "BULK_ASSIGN"
        ? input.userIds.map((userId) => ({
            ...input,
            userId,
            phaseIndex: null,
          }))
        : [input];
      if (new Set(rows.map((row) => row.userId)).size !== rows.length)
        throw fail("Danh sách nhân sự được chọn bị trùng");
      const created = await prisma.$transaction(
        async (tx) => {
          const results = [];
          for (const row of rows) {
            const valid = await ensureValidAssignment(tx, row);
            const createdAssignment = await tx.shiftStaffingAssignment.create({
              data: {
                userId: row.userId,
                positionId: row.positionId,
                crewCode: row.crewCode || null,
                phaseIndex: valid.phaseIndex,
                cycleStartDate: valid.cycleStartDate,
                stationCode: row.stationCode ?? null,
                assignmentType: row.assignmentType,
                startDate: valid.startDate,
                endDate: valid.endDate,
                status: "ACTIVE",
                changeReason: row.reason,
                note: row.note ?? null,
                createdById: actor.id,
                updatedById: actor.id,
              },
            });
            const employee = await tx.user.findUniqueOrThrow({ where: { id: row.userId }, select: { employeeId: true } });
            await syncCrewRotation(tx, row, actor.id);
            await tx.staffingChangeEvent.create({
              data: {
                employeeId: employee.employeeId,
                changeType: row.assignmentType === "ADMINISTRATIVE" ? "MOVE_TO_OFFICE" : "ASSIGN_POSITION",
                sourcePositionId: null,
                targetPositionId: row.assignmentType === "ADMINISTRATIVE" ? null : row.positionId,
                effectiveDate: valid.startDate,
                reason: row.reason,
                createdById: actor.id,
              },
            });
            results.push(createdAssignment);
          }
          return results;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await audit(
        actor.id,
        input.action === "BULK_ASSIGN" ? "BULK_ASSIGN_SHIFT_STAFFING" : "ASSIGN_SHIFT_STAFFING",
        "ShiftStaffingAssignment",
        created[0].id,
        detail(`${input.reason} (${created.length} nhân sự)`, input.effectiveDate),
        {
          actorName: actor.name,
          afterData: snapshot(created),
          saveToAuditLog: true,
        },
      );
      return ok(input.action === "BULK_ASSIGN" ? created : created[0]);
    }
    const old = await prisma.shiftStaffingAssignment.findUnique({
      where: { id: input.assignmentId },
    });
    if (!old) throw fail("Không tìm thấy phân công");
    if (input.action === "DETACH") {
      if (date(input.effectiveDate) <= old.startDate)
        throw fail("Ngày tách phải sau ngày bắt đầu phân công");
      const ended = await prisma.$transaction(async (tx) => {
        const result = await tx.shiftStaffingAssignment.update({
          where: { id: old.id },
          data: {
            endDate: previousDay(input.effectiveDate),
            status: "ENDED",
            changeReason: input.reason,
            updatedById: actor.id,
          },
        });
        const employee = await tx.user.findUniqueOrThrow({ where: { id: old.userId }, select: { employeeId: true } });
        await tx.staffingChangeEvent.create({
          data: {
            employeeId: employee.employeeId,
            changeType: "REMOVE_POSITION",
            sourcePositionId: old.positionId,
            targetPositionId: null,
            effectiveDate: date(input.effectiveDate),
            reason: input.reason,
            createdById: actor.id,
          },
        });
        return result;
      });
      await audit(
        actor.id,
        "DETACH_SHIFT_STAFFING",
        "ShiftStaffingAssignment",
        ended.id,
        detail(input.reason, input.effectiveDate),
        {
          actorName: actor.name,
          beforeData: snapshot(old),
          afterData: snapshot(ended),
          saveToAuditLog: true,
        },
      );
      return ok(ended);
    }
    if (date(input.effectiveDate) <= old.startDate)
      throw fail("Ngày hiệu lực mới phải sau ngày bắt đầu phân công cũ");
    const result = await prisma.$transaction(
      async (tx) => {
        const valid = await ensureValidAssignment(tx, input, old.id);
        const ended = await tx.shiftStaffingAssignment.update({
          where: { id: old.id },
          data: {
            endDate: previousDay(input.effectiveDate),
            status: "ENDED",
            changeReason: input.reason,
            updatedById: actor.id,
          },
        });
        const created = await tx.shiftStaffingAssignment.create({
          data: {
            userId: input.userId,
            positionId: input.positionId,
            crewCode: input.crewCode || null,
            phaseIndex: valid.phaseIndex,
            cycleStartDate: valid.cycleStartDate,
            stationCode: input.stationCode ?? null,
            assignmentType: input.assignmentType,
            startDate: date(input.effectiveDate),
            endDate: input.endDate ? date(input.endDate) : null,
            status: "ACTIVE",
            changeReason: input.reason,
            note: input.note ?? null,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
        const employee = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { employeeId: true } });
        const changeType = input.assignmentType === "ADMINISTRATIVE"
          ? "MOVE_TO_OFFICE"
          : old.positionId !== input.positionId
            ? "TRANSFER_POSITION"
            : old.crewCode !== input.crewCode
              ? "CHANGE_CREW"
              : "CHANGE_STATION";
        await syncCrewRotation(tx, input, actor.id);
        await tx.staffingChangeEvent.create({
          data: {
            employeeId: employee.employeeId,
            changeType,
            sourcePositionId: old.positionId,
            targetPositionId: input.assignmentType === "ADMINISTRATIVE" ? null : input.positionId,
            effectiveDate: valid.startDate,
            reason: input.reason,
            createdById: actor.id,
          },
        });
        return { ended, created };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const action =
      old.positionId !== input.positionId
        ? "TRANSFER_SHIFT_STAFFING"
        : old.crewCode !== input.crewCode
          ? "UPDATE_SHIFT_CREW_CODE"
          : (old.cycleStartDate?.toISOString().slice(0, 10) ?? null) !== (input.cycleStartDate ?? null)
            ? "UPDATE_SHIFT_CYCLE_START_DATE"
          : old.phaseIndex !== input.phaseIndex
            ? "UPDATE_SHIFT_PHASE_INDEX"
            : old.stationCode !== input.stationCode
              ? "CHANGE_SHIFT_STATION_MODE"
              : old.assignmentType !== input.assignmentType
                ? "CHANGE_SHIFT_ASSIGNMENT_TYPE"
                : "CHANGE_SHIFT_EFFECTIVE_DATE";
    await audit(
      actor.id,
      action,
      "ShiftStaffingAssignment",
      result.created.id,
      detail(input.reason, input.effectiveDate),
      {
        actorName: actor.name,
        beforeData: snapshot(old),
        afterData: snapshot(result.created),
        saveToAuditLog: true,
      },
    );
    return ok(result.created);
  });
}
