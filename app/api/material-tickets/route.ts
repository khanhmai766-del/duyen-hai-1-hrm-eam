import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import {
  isShiftLeader,
  isStats,
  getPositionScopes,
  nextTicketCode,
  getWorkflowRoleMap,
  stepAllowedWithMap,
} from "@/lib/material-workflow";

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

    const tickets = await prisma.materialTicket.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const scopes = await getPositionScopes(user.position);
    // Quyền theo từng bước (admin cấu hình trong MaterialWorkflowRole; trống = mặc định cũ).
    const wfMap = await getWorkflowRoleMap();
    return ok(tickets, {
      viewer: {
        id: user.id,
        name: user.name,
        position: user.position ?? null,
        isShiftLeader: isShiftLeader(user.position),
        isStats: isStats(user.position),
        canCreate: stepAllowedWithMap(wfMap, "create", user),
        isAdmin: user.role === "ADMIN",
        hasScope: scopes.length > 0,
        steps: {
          create: stepAllowedWithMap(wfMap, "create", user),
          confirm: stepAllowedWithMap(wfMap, "confirm", user),
          accept: stepAllowedWithMap(wfMap, "accept", user),
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
    const type = body.type === "UNG" ? "UNG" : body.type === "DE_XUAT" ? "DE_XUAT" : null;
    if (!type) return fail("Loại phiếu không hợp lệ");
    const unit = String(body.unit || "").trim();
    if (!["S1", "S2", "COMMON"].includes(unit)) return fail("Tổ máy không hợp lệ");
    // BBKT không còn bắt buộc lúc tạo (bổ sung ở bước Nghiệm thu nếu có);
    // thay bằng Ghi chú bắt buộc cho luồng Đề xuất.
    const bbkt = String(body.bbktNumber || "").trim();
    const proposalNote = String(body.note || "").trim();
    if (type === "DE_XUAT" && !proposalNote) return fail("Vui lòng nhập Ghi chú cho phiếu đề xuất");

    // Cương vị được giao: bắt buộc, và phải là cương vị có phân giao cây thiết bị
    const assignedPosition = String(body.assignedPosition || "").trim();
    if (!assignedPosition) return fail("Vui lòng chọn cương vị được giao thực hiện");
    const scopeCount = await prisma.positionSystemScope.count({ where: { position: assignedPosition } });
    if (scopeCount === 0) return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);

    // Loại vật tư
    const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];
    const materialCategory = String(body.materialCategory || "").trim();
    if (!CATEGORIES.includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");

    let materialForProposal: { id: string; name: string; quantity: number } | null = null;
    let requestedQuantity = 0;
    let replacementDeviceName = "";
    let nextStatus = type === "DE_XUAT" ? "CHO_PHIEU__XUAT_KHO" : "CHO_NHAP_LIEU";

    if (type === "DE_XUAT") {
      const materialId = String(body.materialId || "").trim();
      requestedQuantity = Math.trunc(Number(body.proposedQuantity || body.quantity || 0));
      replacementDeviceName = String(body.replacementDeviceName || "").trim();

      if (!materialId) return fail("Vui lòng chọn tên vật tư đề xuất");
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return fail("Số lượng đề xuất phải lớn hơn 0");
      if (!replacementDeviceName) return fail("Vui lòng nhập tên thiết bị thay thế");

      materialForProposal = await prisma.material.findUnique({
        where: { id: materialId },
        select: { id: true, name: true, quantity: true },
      });
      if (!materialForProposal) return fail("Không tìm thấy vật tư đề xuất", 404);
      nextStatus = materialForProposal.quantity >= requestedQuantity ? "CHO_PHIEU__XUAT_KHO" : "VAT_TU_KHONG_CO";
    }

    const code = await nextTicketCode(type);
    const ticket = await prisma.materialTicket.create({
      data: {
        code,
        type,
        unit,
        status: nextStatus,
        bbktNumber: type === "DE_XUAT" ? bbkt || null : null,
        proposalNote: type === "DE_XUAT" ? proposalNote : null,
        assignedPosition,
        materialCategory,
        createdById: user.id,
        createdByName: user.name ?? "",
        ...(type === "DE_XUAT" ? {
          proposedById: user.id,
          proposedByName: user.name ?? "",
          proposedByPosition: user.position ?? null,
          proposedAt: new Date(),
          ...(nextStatus === "CHO_PHIEU__XUAT_KHO" ? {
            confirmedById: user.id,
            confirmedByName: "Hệ thống",
            confirmedAt: new Date(),
          } : {}),
          items: {
            create: [{
              materialId: materialForProposal!.id,
              quantity: requestedQuantity,
              deviceNameManual: replacementDeviceName,
            }],
          },
        } : {}),
      },
      include: ITEM_INCLUDE,
    });

    await audit(user.id, "CREATE_MATERIAL_TICKET", "MaterialTicket", ticket.id,
      `${code} (${type === "UNG" ? "Ứng" : "Đề xuất"}, ${unit}) — giao: ${assignedPosition}, loại: ${materialCategory}` +
      (type === "DE_XUAT" ? `, vật tư: ${materialForProposal!.name}, SL: ${requestedQuantity}, thiết bị: ${replacementDeviceName}, trạng thái: ${nextStatus}` : ""));
    return ok(ticket);
  });
}
