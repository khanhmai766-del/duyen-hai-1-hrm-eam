import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser, audit } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { isGroupableCategory, runOilGroupingSync } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanStock(value: unknown) {
  const next = Math.round(Number(value));
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const category = cleanString(req.nextUrl.searchParams.get("category"));
    if (!isGroupableCategory(category)) return fail("Loại vật tư không hợp lệ");

    const materials = await prisma.erpMaterial.findMany({
      where: { category },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        warehouse: true,
        erpStock: true,
        category: true,
        mappingStatus: true,
        isActive: true,
        oilType: { select: { id: true, code: true, name: true } },
      },
    });
    return ok(materials);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được sửa số liệu ERP", 403);
    }
    const body = await req.json();
    const id = cleanString(body.id);
    if (!id) return fail("Thiếu id vật tư ERP");
    const current = await prisma.erpMaterial.findUnique({ where: { id } });
    if (!current) return fail("Không tìm thấy vật tư ERP", 404);

    const data: { code?: string; name?: string; unit?: string; warehouse?: string | null; category?: string; erpStock?: number; isActive?: boolean; oilTypeId?: null; mappingStatus?: "UNMAPPED"; conversionFactor?: number; suggestedOilTypeId?: null; suggestedScore?: null; suggestedReason?: null } = {};
    if (Object.prototype.hasOwnProperty.call(body, "code")) {
      const code = cleanString(body.code);
      if (!code) return fail("Mã vật tư không được để trống");
      const duplicate = await prisma.erpMaterial.findFirst({ where: { code, id: { not: id } }, select: { id: true } });
      if (duplicate) return fail("Mã vật tư ERP đã tồn tại");
      data.code = code;
    }
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = cleanString(body.name);
      if (!name) return fail("Tên vật tư không được để trống");
      data.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "unit")) {
      const unit = cleanString(body.unit);
      if (!unit) return fail("ĐVT không được để trống");
      data.unit = unit;
    }
    if (Object.prototype.hasOwnProperty.call(body, "warehouse")) data.warehouse = cleanString(body.warehouse) || null;
    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      const category = cleanString(body.category);
      if (!isGroupableCategory(category)) return fail("Loại vật tư không hợp lệ");
      if (current.oilTypeId && category !== current.category) return fail("Hãy gỡ mã khỏi nhóm trước khi đổi loại vật tư");
      data.category = category;
    }
    if (Object.prototype.hasOwnProperty.call(body, "erpStock")) {
      const erpStock = Math.round(Number(body.erpStock));
      if (!Number.isFinite(erpStock) || erpStock < 0) return fail("Số liệu ERP không hợp lệ");
      data.erpStock = erpStock;
    }
    const changingActive = Object.prototype.hasOwnProperty.call(body, "isActive");
    if (changingActive) {
      const isActive = body.isActive === true;
      if (!isActive && current.isActive) {
        const unfinishedTicket = await prisma.materialTicketItem.findFirst({
          where: { erpCode: current.code, ticket: { completedAt: null } },
          select: { ticketId: true },
        });
        if (unfinishedTicket) return fail("Không thể ngừng sử dụng mã đang có phiếu vật tư chưa hoàn thành", 409);
      }
      data.isActive = isActive;
      if (!isActive) {
        data.oilTypeId = null;
        data.mappingStatus = "UNMAPPED";
        data.conversionFactor = 1;
        data.suggestedOilTypeId = null;
        data.suggestedScore = null;
        data.suggestedReason = null;
      }
    }
    if (!Object.keys(data).length) return fail("Không có thông tin cần cập nhật");

    const material = await prisma.$transaction(async (tx) => {
      const updated = await tx.erpMaterial.update({ where: { id }, data });
      if (changingActive && current.isActive !== updated.isActive) {
        await tx.oilTypeMappingLog.create({
          data: {
            materialId: id,
            oilTypeId: current.oilTypeId,
            action: updated.isActive ? "REACTIVATED" : "DEACTIVATED",
            reason: updated.isActive ? "Khôi phục sử dụng mã vật tư" : "Ngừng sử dụng mã vật tư",
            userId: user.id,
          },
        });
      }
      return updated;
    });
    await audit(user.id, changingActive ? (material.isActive ? "REACTIVATE_ERP_MATERIAL" : "DEACTIVATE_ERP_MATERIAL") : "UPDATE_ERP_MATERIAL", "ErpMaterial", id, `${current.code} → ${material.code}`);
    return ok(material);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được thêm vật tư ERP", 403);
    }

    const body = await req.json();
    const code = cleanString(body.code);
    const name = cleanString(body.name);
    const unit = cleanString(body.unit);
    const category = cleanString(body.category);
    if (!code || !name || !unit) return fail("Thiếu thông tin bắt buộc");
    if (!isGroupableCategory(category)) return fail("Loại vật tư không thuộc module tồn kho theo nhóm");

    const exists = await prisma.erpMaterial.findUnique({ where: { code }, select: { id: true } });
    if (exists) return fail("Mã vật tư ERP đã tồn tại");

    const material = await prisma.erpMaterial.create({
      data: {
        code,
        name,
        unit,
        category,
        warehouse: cleanString(body.warehouse) || null,
        erpStock: cleanStock(body.erpStock),
      },
    });

    await runOilGroupingSync(category).catch(() => null);
    await audit(user.id, "CREATE_GROUPED_ERP_MATERIAL", "ErpMaterial", material.id, material.code);
    return ok(material);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được xoá vật tư ERP", 403);
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (!ids.length) return fail("Vui lòng chọn ít nhất một mã vật tư cần xoá");

    const materials = await prisma.erpMaterial.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true },
    });
    if (!materials.length) return fail("Không tìm thấy mã vật tư để xoá", 404);

    const usedCodes = await prisma.materialTicketItem.findMany({
      where: { erpCode: { in: materials.map((material) => material.code) } },
      select: { erpCode: true },
      distinct: ["erpCode"],
    });
    if (usedCodes.length) {
      return fail(`Không thể xoá ${usedCodes.length} mã đã có lịch sử phiếu vật tư. Vui lòng chọn “Ngừng sử dụng”`, 409);
    }

    const foundIds = materials.map((material) => material.id);
    const result = await prisma.$transaction(async (tx) => {
      await tx.oilTypeMappingLog.deleteMany({ where: { materialId: { in: foundIds } } });
      return tx.erpMaterial.deleteMany({ where: { id: { in: foundIds } } });
    });

    await audit(user.id, "DELETE_ERP_MATERIAL", "ErpMaterial", foundIds.join(","), materials.map((material) => material.code).join(", "));
    return ok({ ids: foundIds, count: result.count });
  });
}
