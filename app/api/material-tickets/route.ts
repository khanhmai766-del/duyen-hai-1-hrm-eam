import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { isShiftLeader, isStats, canCreateTicket, getPositionScopes, nextTicketCode } from "@/lib/material-workflow";

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
/** Nhóm được XEM TẤT CẢ phiếu: Quản trị, Quản lý, Trưởng ca/Kỹ thuật viên (role)
 *  + Trưởng Ca/Trưởng Kíp + Thống kê (theo cương vị, để vận hành workflow). */
function canViewAll(user: { role: string; position?: string | null }) {
  return (
    ["ADMIN", "SUPERVISOR", "TECHNICIAN"].includes(user.role) ||
    isShiftLeader(user.position) ||
    isStats(user.position)
  );
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = {};
    if (sp.get("status")) where.status = sp.get("status");
    if (sp.get("type")) where.type = sp.get("type");
    if (sp.get("unit")) where.unit = sp.get("unit");
    // Người không thuộc nhóm quản lý: CHỈ thấy phiếu giao cho đúng cương vị mình
    if (!canViewAll(user)) where.assignedPosition = user.position ?? "__none__";

    const tickets = await prisma.materialTicket.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const scopes = await getPositionScopes(user.position);
    return ok(tickets, {
      viewer: {
        id: user.id,
        name: user.name,
        position: user.position ?? null,
        isShiftLeader: isShiftLeader(user.position),
        isStats: isStats(user.position),
        canCreate: canCreateTicket(user),
        hasScope: scopes.length > 0,
      },
    });
  });
}

// POST /api/material-tickets  { type, unit, bbktNumber? }
// Chỉ Trưởng Ca/TK được tạo phiếu. Luồng Đề xuất bắt buộc số BBKT ngay từ đầu.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canCreateTicket(user)) {
      return fail("Chỉ Quản trị, Kỹ thuật viên, Trưởng Ca / Trưởng Kíp được tạo phiếu thay thế vật tư", 403);
    }
    const body = await req.json();
    const type = body.type === "UNG" ? "UNG" : body.type === "DE_XUAT" ? "DE_XUAT" : null;
    if (!type) return fail("Loại phiếu không hợp lệ");
    const unit = String(body.unit || "").trim();
    if (!["S1", "S2"].includes(unit)) return fail("Tổ máy không hợp lệ");
    const bbkt = String(body.bbktNumber || "").trim();
    if (type === "DE_XUAT" && !bbkt) return fail("Luồng Đề xuất bắt buộc nhập số BBKT khi tạo phiếu");

    // Cương vị được giao: bắt buộc, và phải là cương vị có phân giao cây thiết bị
    const assignedPosition = String(body.assignedPosition || "").trim();
    if (!assignedPosition) return fail("Vui lòng chọn cương vị được giao thực hiện");
    const scopeCount = await prisma.positionSystemScope.count({ where: { position: assignedPosition } });
    if (scopeCount === 0) return fail(`Cương vị "${assignedPosition}" chưa được phân giao hệ thống thiết bị`);

    // Loại vật tư
    const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];
    const materialCategory = String(body.materialCategory || "").trim();
    if (!CATEGORIES.includes(materialCategory)) return fail("Vui lòng chọn loại vật tư");

    const code = await nextTicketCode(type);
    const ticket = await prisma.materialTicket.create({
      data: {
        code,
        type,
        unit,
        status: type === "DE_XUAT" ? "CHO_DE_XUAT" : "CHO_NHAP_LIEU",
        bbktNumber: type === "DE_XUAT" ? bbkt : null,
        assignedPosition,
        materialCategory,
        createdById: user.id,
        createdByName: user.name ?? "",
      },
      include: ITEM_INCLUDE,
    });

    await audit(user.id, "CREATE_MATERIAL_TICKET", "MaterialTicket", ticket.id,
      `${code} (${type === "UNG" ? "Ứng" : "Đề xuất"}, ${unit}) — giao: ${assignedPosition}, loại: ${materialCategory}`);
    return ok(ticket);
  });
}
