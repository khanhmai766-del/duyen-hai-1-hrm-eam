import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import {
  isShiftLeader,
  isStats,
  getPositionScopes,
  getWorkflowRoleMap,
  stepAllowedWithMap,
} from "@/lib/material-workflow";
import { TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";
import {
  isMaterialTicketMonthKey,
  materialTicketMonthKey,
  materialTicketReference,
} from "@/lib/material-ticket-sequence";

export const dynamic = "force-dynamic";

const ITEM_INCLUDE = {
  items: {
    include: {
      material: { select: { id: true, code: true, name: true, unit: true, quantity: true } },
      device: { select: { seq: true, name: true, kks: true } },
    },
  },
} as const;

// GET /api/material-tickets?status=&type=&unit=
// meta.viewer cho client biết quyền hiện tại để hiển thị đúng nút.
// MỌI cương vị đăng nhập đều XEM được toàn bộ phiếu (chỉ hành động mới bị
// giới hạn theo lượt/cương vị — kiểm tra ở API action).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = {};
    if (sp.get("status")) where.status = sp.get("status");
    if (sp.get("type")) where.type = sp.get("type");
    if (sp.get("unit")) where.unit = sp.get("unit");
    const month = sp.get("month")?.trim();
    if (month && month !== "ALL") {
      if (!isMaterialTicketMonthKey(month)) return fail("Tháng tra cứu không hợp lệ");
      where.sequenceMonth = month;
    }

    const [tickets, monthGroups] = await Promise.all([
      prisma.materialTicket.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: [{ sequenceMonth: "desc" }, { sequenceNumber: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      prisma.materialTicket.groupBy({
        by: ["sequenceMonth"],
        _count: { _all: true },
        orderBy: { sequenceMonth: "desc" },
      }),
    ]);
    const itemPairs = tickets.flatMap((ticket) =>
      ticket.items
        .filter((item) => item.deviceSeq)
        .map((item) => ({ materialId: item.materialId, deviceSeq: item.deviceSeq! }))
    );
    const replacementLabels = itemPairs.length
      ? await prisma.materialReplacement.findMany({
          where: {
            isActive: false,
            OR: itemPairs.map((item) => ({ materialId: item.materialId, deviceSeq: item.deviceSeq })),
          },
          select: { materialId: true, deviceSeq: true, location: true, system: true, device: { select: { name: true } } },
        })
      : [];
    const replacementLabelByKey = new Map(
      replacementLabels.map((item) => [
        `${item.materialId}::${item.deviceSeq}`,
        item.location || item.device?.name || item.system || item.deviceSeq || "Thiết bị thay thế",
      ])
    );
    const activityRows = tickets.length ? await prisma.auditLog.findMany({
      where: { entity: "MaterialTicket", entityId: { in: tickets.map((ticket) => ticket.id) } },
      include: { user: { select: { name: true, position: true } } },
      orderBy: { createdAt: "asc" },
    }) : [];
    const activityByTicket = new Map<string, typeof activityRows>();
    for (const row of activityRows) {
      if (!row.entityId) continue;
      activityByTicket.set(row.entityId, [...(activityByTicket.get(row.entityId) ?? []), row]);
    }
    const ticketsWithActivity = tickets.map((ticket) => ({
      ...ticket,
      items: ticket.items.map((item) => ({
        ...item,
        deviceNameManual: item.deviceNameManual || (item.deviceSeq ? replacementLabelByKey.get(`${item.materialId}::${item.deviceSeq}`) ?? null : null),
      })),
      activityLogs: activityByTicket.get(ticket.id) ?? [],
    }));

    const scopes = await getPositionScopes(user.position);
    const totalScopeCount = await prisma.positionSystemScope.count();
    // Quyền theo từng bước (admin cấu hình trong MaterialWorkflowRole; trống = mặc định cũ).
    const wfMap = await getWorkflowRoleMap();
    return ok(ticketsWithActivity, {
      months: monthGroups.map((group) => ({ month: group.sequenceMonth, count: group._count._all })),
      viewer: {
        id: user.id,
        name: user.name,
        position: user.position ?? null,
        isShiftLeader: isShiftLeader(user.position),
        isStats: isStats(user.position),
        canCreate: stepAllowedWithMap(wfMap, "create", user),
        isAdmin: user.role === "ADMIN",
        hasScope: totalScopeCount === 0 || scopes.length > 0,
        steps: {
          create: stepAllowedWithMap(wfMap, "create", user),
          confirm: stepAllowedWithMap(wfMap, "confirm", user),
          stats: stepAllowedWithMap(wfMap, "stats", user),
          receive: stepAllowedWithMap(wfMap, "receive", user),
          use: stepAllowedWithMap(wfMap, "use", user),
          accept: stepAllowedWithMap(wfMap, "accept", user),
          ungAdvance: stepAllowedWithMap(wfMap, "ungAdvance", user),
          ungEntry: stepAllowedWithMap(wfMap, "ungEntry", user),
          ungConfirm: stepAllowedWithMap(wfMap, "ungConfirm", user),
          ungBbkt: stepAllowedWithMap(wfMap, "ungBbkt", user),
          manage: stepAllowedWithMap(wfMap, "manage", user),
          manageConfigured: wfMap.manage.length > 0,
        },
      },
    });
  });
}

// POST /api/material-tickets  { type, unit, bbktNumber? }
// Luồng Đề xuất gộp BBKT + đề xuất vật tư ngay khi tạo phiếu.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const wfMap = await getWorkflowRoleMap();
    if (!stepAllowedWithMap(wfMap, "create", user)) {
      return fail("Bạn không có quyền tạo phiếu thay thế vật tư (Quản trị phân quyền ở mục Phân quyền quy trình)", 403);
    }
    const body = await req.json();
    const type = "CHUA_CHON";
    const unit = String(body.unit || "").trim();
    if (!["S1", "S2", "COMMON"].includes(unit)) return fail("Tổ máy không hợp lệ");
    // BBKT không còn bắt buộc lúc tạo (bổ sung ở bước Nghiệm thu nếu có);
    // thay bằng Ghi chú bắt buộc cho luồng Đề xuất.
    const proposalNote = String(body.note || "").trim();
    if (!proposalNote) return fail("Vui lòng nhập ghi chú lý do");

    // Cương vị được giao: bắt buộc, và phải là cương vị có phân giao cây thiết bị
    const assignedPosition = String(body.assignedPosition || "").trim();
    if (!assignedPosition) return fail("Vui lòng chọn cương vị được giao thực hiện");
    const totalScopeCount = await prisma.positionSystemScope.count();
    const scopeCount = await prisma.positionSystemScope.count({ where: { position: assignedPosition } });
    if (totalScopeCount > 0 && scopeCount === 0) return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);

    // Loại vật tư
    const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];
    const materialCategory = String(body.materialCategory || "").trim();
    if (!CATEGORIES.includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");

    let selectedMaterial: { id: string; code: string; erpCodes: string[]; name: string; quantity: number; category: string | null; machine: string } | null = null;
    const nextStatus = "CHO_XAC_NHAN";
    const materialId = String(body.materialId || "").trim();
    if (!materialId) return fail("Vui lòng chọn tên vật tư");
    const proposedQuantity = Math.trunc(Number(body.proposedQuantity || body.quantity || 0));
    if (!Number.isFinite(proposedQuantity) || proposedQuantity <= 0) return fail("Số lượng đề xuất phải lớn hơn 0");
    const replacementDeviceSeq = String(body.replacementDeviceSeq || "").trim();
    if (!replacementDeviceSeq) return fail("Vui lòng chọn thiết bị thay thế");

    selectedMaterial = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, code: true, erpCodes: true, name: true, quantity: true, category: true, machine: true },
    });
    if (!selectedMaterial) return fail("Không tìm thấy vật tư", 404);
    const expectedCategory = TICKET_TO_MATERIAL_CATEGORY[materialCategory] ?? materialCategory;
    if (selectedMaterial.category !== expectedCategory) return fail("Vật tư không thuộc loại vật tư đã chọn");
    if (selectedMaterial.machine !== unit) return fail("Vật tư không thuộc tổ máy đã chọn");
    const replacementPoint = await prisma.materialReplacement.findFirst({
      where: { materialId: selectedMaterial.id, deviceSeq: replacementDeviceSeq, isActive: false },
      select: { deviceSeq: true, location: true, system: true, device: { select: { name: true } } },
    });
    if (!replacementPoint?.deviceSeq || !replacementPoint.device) {
      return fail("Thiết bị chưa được khai báo trong Chi tiết điểm thay thế của vật tư");
    }
    const replacementDeviceLabel = replacementPoint.location || replacementPoint.device.name || replacementPoint.system || replacementPoint.deviceSeq;

    const sequenceMonth = materialTicketMonthKey();
    const ticket = await prisma.$transaction(async (tx) => {
      // Tuần tự hóa thao tác tạo/xóa để STT trong tháng luôn duy nhất và liên tục.
      await tx.$executeRaw`LOCK TABLE "MaterialTicket" IN EXCLUSIVE MODE`;
      const latestSequence = await tx.materialTicket.aggregate({
        where: { sequenceMonth },
        _max: { sequenceNumber: true },
      });
      const sequenceNumber = (latestSequence._max.sequenceNumber ?? 0) + 1;
      const ticket = await tx.materialTicket.create({
        data: {
          sequenceMonth,
          sequenceNumber,
          type,
          unit,
          status: nextStatus,
          bbktNumber: null,
          proposalNote,
          assignedPosition,
          materialCategory,
          createdById: user.id,
          createdByName: user.name ?? "",
          items: {
            create: [{
              materialId: selectedMaterial!.id,
              erpCode: null,
              quantity: proposedQuantity,
              deviceSeq: replacementPoint.deviceSeq,
              deviceNameManual: replacementDeviceLabel,
            }],
          },
        },
        include: ITEM_INCLUDE,
      });
      return ticket;
    });

    await audit(user.id, "CREATE_MATERIAL_TICKET", "MaterialTicket", ticket.id,
      `${materialTicketReference(ticket)} (chưa chọn luồng, ${unit}) — giao: ${assignedPosition}, loại: ${materialCategory}, vật tư: ${selectedMaterial!.name}, số lượng đề xuất: ${proposedQuantity}, thiết bị: ${replacementDeviceLabel}`);
    return ok(ticket);
  });
}
