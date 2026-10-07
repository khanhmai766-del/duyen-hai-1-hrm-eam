import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  audit,
  auditDetailWithPosition,
  fail,
  handle,
  ok,
  requireUser,
  requireRole,
} from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  GROUNDING_PERMISSIONS,
  groundingScopeWithPermissions,
  isGroundingMachine,
  isGroundingType,
  groundingInspectorAvatars,
  serializeGroundingItem,
  serializeGroundingOverviewItem,
} from "@/lib/grounding-lightning";
import { SHIFT_TYPE_ORDER } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { assignGroundingShifts, currentGroundingSlot, groundingSlotWindow, isGroundingShift } from "@/lib/grounding-inspection-schedule";
import { serializeGroundingSlotItem } from "@/lib/grounding-lightning";
import { isPositionCode, positionLabelOf } from "@/lib/position-catalog";

import { groundingRetentionWindow } from "@/lib/grounding-retention";
import { runGroundingRetention } from "@/lib/server/grounding-retention";

export const dynamic = "force-dynamic";

const includeItem = {
  splitFrom: { select: { id: true, areaEquipment: true } },
  points: {
    orderBy: { type: "asc" as const },
    include: { attachments: { orderBy: { createdAt: "asc" as const } } },
  },
  inspections: {
    orderBy: { signedAt: "desc" as const },
    take: 1,
    include: { results: { orderBy: { type: "asc" as const } } },
  },
};

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, GROUNDING_PERMISSIONS.view, [
      "read",
      "personal",
      "manage",
      "full",
    ]);
    const sp = req.nextUrl.searchParams;
    const scope = await groundingScopeWithPermissions(user);
    const q = sp.get("q")?.trim();
    const positionCode = sp.get("positionCode");
    const machine = sp.get("machine");
    const type = sp.get("type");
    const status = sp.get("status");
    const catalogOnly = sp.get("catalog") === "1";
    const now = new Date();
    const retention = groundingRetentionWindow(now);
    const currentSlot = currentGroundingSlot(now);
    const date = sp.get("inspectionDate") ?? currentSlot.date;
    const archived = sp.get("shiftType") === "ARCHIVED";
    if (archived && process.env.NODE_ENV !== "development") return fail("Danh mục cũ không thuộc danh sách kiểm tra", 404);
    const allShifts = sp.get("shiftType") === "ALL" || archived;
    const shiftType = allShifts ? currentSlot.shiftType : sp.get("shiftType") ?? currentSlot.shiftType;
    if (!isGroundingShift(shiftType)) return fail("Ca kiểm tra không hợp lệ");
    const selectedSlot = { date, shiftType };
    let dayStart: Date, dayEnd: Date;
    try {
      dayStart = groundingSlotWindow({ date, shiftType: "MORNING" }).start;
      dayEnd = groundingSlotWindow({ date, shiftType: "NIGHT" }).end;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Ngày kiểm tra không hợp lệ");
    }
    if (date < retention.date) return fail("Chỉ lưu lịch sử kiểm tra trong 1 tháng 15 ngày gần nhất");
    await runGroundingRetention(prisma, now);
    // Chia tuyến từ danh mục đầy đủ của mỗi cương vị + tổ máy, trước khi tìm kiếm/lọc kết quả.
    const where: Prisma.GroundingLightningItemWhereInput = {
      isActive: !archived,
      ...(!scope.all
        ? { positionCode: scope.positionCode ?? "__NO_POSITION__" }
        : positionCode && positionCode !== "ALL" ? { positionCode } : {}),
      ...(machine && machine !== "ALL" ? { machine } : {}),
    };
    const [items, positionRows] = await Promise.all([
      prisma.groundingLightningItem.findMany({
        where,
        include: catalogOnly || archived ? {
          ...includeItem,
          inspections: { ...includeItem.inspections, where: { signedAt: { gte: retention.cutoff } } },
        } : {
          ...includeItem,
          inspections: {
            where: { signedAt: { gte: dayStart, lt: dayEnd } },
            orderBy: { signedAt: "desc" },
            include: { results: { orderBy: { type: "asc" } } },
          },
        },
        orderBy: [
          { position: "asc" },
          { machine: "asc" },
          { areaEquipment: "asc" },
        ],
      }),
      prisma.groundingLightningItem.findMany({
        where: { isActive: !archived, ...(!scope.all
          ? { positionCode: scope.positionCode ?? "__NO_POSITION__" }
          : {}) },
        select: { positionCode: true, position: true },
        distinct: ["positionCode"],
        orderBy: { position: "asc" },
      }),
    ]);
    if (catalogOnly) {
      return ok(items.map((item) => serializeGroundingItem(item)), { scope });
    }
    const assignments = assignGroundingShifts(items);
    const avatars = await groundingInspectorAvatars(items);
    const rowsForSlot = (slot: typeof selectedSlot) => items
      .filter((item) => assignments.get(item.id)?.includes(slot.shiftType))
      .map((item) => serializeGroundingSlotItem(item, slot, assignments.get(item.id) ?? [], avatars, now));
    const shifts = archived ? [] : SHIFT_TYPE_ORDER.map((value) => {
      const rows = rowsForSlot({ date, shiftType: value });
      const confirmed = rows.filter((item) => !item.needsSignature).length;
      return { shiftType: value, total: rows.length, confirmed, pending: rows.length - confirmed };
    });
    const matchesFilters = (item: { splitFrom?: { areaEquipment: string } | null; areaEquipment: string; note: string | null; points: Array<{ type: string; status: string; defectDescription: string | null }> }) => {
      if (q && ![item.areaEquipment, item.splitFrom?.areaEquipment, item.note, ...item.points.map((point) => point.defectDescription)]
        .some((value) => normalizeText(value ?? "").includes(normalizeText(q)))) return false;
      if ((type && type !== "ALL") || (status && status !== "ALL")) {
        return item.points.some((point) =>
          (!type || type === "ALL" || point.type === type) &&
          (!status || status === "ALL" || point.status === status));
      }
      return true;
    };
    return ok(
      (archived
        ? items.map((item) => ({ ...serializeGroundingItem(item, avatars), canInspect: false, needsSignature: false }))
        : allShifts
        ? items.map((item) => serializeGroundingOverviewItem(item, date, assignments.get(item.id) ?? [], avatars, now))
        : rowsForSlot(selectedSlot)).filter(matchesFilters),
      {
        positions: positionRows.filter((row) => row.positionCode)
          .map((row) => ({ code: row.positionCode, label: row.position })),
        scope, canAssignShift: user.role === "ADMIN" && !archived, currentSlot, selectedSlot, shifts, viewMode: archived ? "ARCHIVED" : allShifts ? "ALL" : "SHIFT",
        serverTime: now.toISOString(), retentionStart: retention.date,
      },
    );
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    /*
     * Tính PHẠM VI trước rồi mới xét quyền theo vai trò — không đảo ngược thứ tự này.
     * Bốn nhóm "toàn quyền" (ADMIN/MANAGER/SUPERVISOR theo vai trò, Quản đốc/Phó quản
     * đốc/Kỹ thuật viên/Trưởng ca theo cương vị) bỏ qua thẳng cổng RBAC catalog bên dưới:
     * "Kỹ thuật viên" thường mang role TECHNICIAN giống mọi VHV khác, RBAC theo vai trò
     * (bảng grounding-lightning-catalog) không phân biệt được — chỉ groundingScope() mới
     * biết dựa vào CƯƠNG VỊ. Người bị giới hạn phạm vi (scope.all === false) vẫn phải qua
     * cổng RBAC như cũ: "personal" cho thêm trong đúng cương vị mình quản lý.
     */
    const scope = await groundingScopeWithPermissions(user);
    if (!scope.all) {
      await requirePermissionLevel(
        user,
        GROUNDING_PERMISSIONS.catalog,
        ["personal", "manage", "full"],
        "Không đủ quyền thêm danh mục kiểm tra",
      );
    }
    const body = (await req.json()) as Record<string, unknown>;
    if ("assignedShift" in body) {
      requireRole(user, ["ADMIN"]);
      if (body.assignedShift !== null && !isGroundingShift(body.assignedShift)) return fail("Ca chỉ định không hợp lệ");
    }
    const areaEquipment = String(body.areaEquipment ?? "").trim();
    const positionCode = String(body.positionCode ?? "").trim();
    const machine = isGroundingMachine(body.machine) ? body.machine : "COMMON";
    const types = Array.from(
      new Set(
        Array.isArray(body.types) ? body.types.filter(isGroundingType) : [],
      ),
    );
    if (!areaEquipment) return fail("Nhập khu vực/thiết bị");
    if (!isPositionCode(positionCode))
      return fail("Chọn đúng cương vị quản lý");
    if (!types.length) return fail("Chọn ít nhất một loại kiểm tra");
    // Chặn tại đây, KHÔNG chỉ ẩn nút ở giao diện: người giữ cương vị A gọi thẳng API vẫn
    // không tạo được thiết bị cho cương vị B — đúng ranh giới "cương vị mình quản lý".
    if (!scope.all && positionCode !== scope.positionCode) {
      return fail("Chỉ được thêm thiết bị thuộc cương vị đang làm việc", 403);
    }
    const duplicate = await prisma.groundingLightningItem.findFirst({
      where: {
        isActive: true,
        positionCode,
        machine,
        areaEquipment: { equals: areaEquipment, mode: "insensitive" },
      },
      include: includeItem,
    });
    if (duplicate) {
      const addedTypes = types.filter(
        (pointType) =>
          !duplicate.points.some((point) => point.type === pointType),
      );
      const incomingNote = String(body.note ?? "").trim();
      const mergedNote =
        [duplicate.note, incomingNote]
          .filter((value): value is string => Boolean(value))
          .filter(
            (value, index, values) =>
              values.findIndex(
                (candidate) =>
                  candidate.toLocaleLowerCase("vi-VN") ===
                  value.toLocaleLowerCase("vi-VN"),
              ) === index,
          )
          .join("\n") || null;
      await prisma.$transaction([
        prisma.groundingLightningItem.update({
          where: { id: duplicate.id },
          data: { note: mergedNote, ...("assignedShift" in body ? { assignedShift: body.assignedShift as string | null } : {}) },
        }),
        ...addedTypes.map((pointType) =>
          prisma.groundingLightningPoint.create({
            data: { itemId: duplicate.id, type: pointType },
          }),
        ),
      ]);
      const merged = await prisma.groundingLightningItem.findUniqueOrThrow({
        where: { id: duplicate.id },
        include: includeItem,
      });
      await audit(
        user.id,
        "MERGE_GROUNDING_LIGHTNING_ITEM",
        "GroundingLightningItem",
        merged.id,
        auditDetailWithPosition(user, areaEquipment),
        {
          beforeData: duplicate,
          afterData: merged,
          changedFields: addedTypes.map((pointType) => `points.${pointType}`),
        },
      );
      return ok(serializeGroundingItem(merged), { merged: true });
    }
    const created = await prisma.groundingLightningItem.create({
      data: {
        areaEquipment,
        positionCode,
        position: positionLabelOf(positionCode),
        machine,
        ...("assignedShift" in body ? { assignedShift: body.assignedShift as string | null } : {}),
        note: String(body.note ?? "").trim() || null,
        createdById: user.id,
        points: { create: types.map((pointType) => ({ type: pointType })) },
      },
      include: includeItem,
    });
    await audit(
      user.id,
      "CREATE_GROUNDING_LIGHTNING_ITEM",
      "GroundingLightningItem",
      created.id,
      auditDetailWithPosition(user, areaEquipment),
      { afterData: created },
    );
    return ok(serializeGroundingItem(created));
  });
}
