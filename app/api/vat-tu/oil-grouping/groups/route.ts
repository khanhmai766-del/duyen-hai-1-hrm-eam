// PUT/DELETE /api/vat-tu/oil-grouping/groups — sửa / xoá nhóm vật tư (OilType).
//
// PUT body: { id, code?, name?, baseUnit?, minStock?, onHandQty?, note? }
// — cập nhật TỪNG PHẦN: chỉ field có mặt trong body mới được ghi (vd ô
// "Hiện có" sửa inline chỉ gửi { id, onHandQty }, không đụng minStock).
// DELETE ?id=<oilTypeId>: xoá nhóm; các mã CONFIRMED trong nhóm trở về
// UNMAPPED (quay lại tab "Chờ phân nhóm"), có ghi log REMOVED từng mã.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được sửa nhóm vật tư", 403);
    }

    const body = await req.json();
    const id = String(body?.id ?? "");
    if (!id) return fail("Thiếu id nhóm");

    const current = await prisma.oilType.findUnique({ where: { id } });
    if (!current) return fail("Không tìm thấy nhóm vật tư", 404);

    const data: {
      code?: string;
      name?: string;
      baseUnit?: string;
      minStock?: number | null;
      onHandQty?: number;
      note?: string | null;
    } = {};

    if ("code" in body) {
      const code = String(body.code ?? "").trim().toUpperCase();
      if (!code) return fail("Mã nhóm không được để trống");
      if (code !== current.code) {
        const existed = await prisma.oilType.findUnique({ where: { code } });
        if (existed) return fail(`Mã nhóm "${code}" đã tồn tại`);
      }
      data.code = code;
    }
    if ("name" in body) {
      const name = String(body.name ?? "").trim();
      if (!name) return fail("Tên nhóm không được để trống");
      data.name = name;
    }
    if ("baseUnit" in body) {
      const baseUnit = String(body.baseUnit ?? "").trim();
      if (!baseUnit) return fail("ĐVT chuẩn không được để trống");
      data.baseUnit = baseUnit;
    }
    if ("minStock" in body) {
      data.minStock = body.minStock === "" || body.minStock == null ? null : Number(body.minStock);
      if (data.minStock != null && (!Number.isFinite(data.minStock) || data.minStock < 0)) {
        return fail("Ngưỡng tối thiểu không hợp lệ");
      }
    }
    if ("onHandQty" in body) {
      const qty = Number(body.onHandQty);
      if (!Number.isFinite(qty) || qty < 0) return fail("Giá trị Hiện có không hợp lệ");
      data.onHandQty = qty;
    }
    if ("note" in body) {
      data.note = body.note != null ? String(body.note).trim() || null : null;
    }
    if (Object.keys(data).length === 0) return fail("Không có nội dung nào để cập nhật");

    const updated = await prisma.oilType.update({ where: { id }, data });

    const detail =
      "onHandQty" in data && Object.keys(data).length === 1
        ? `Cập nhật Hiện có: ${current.code} → ${data.onHandQty} ${current.baseUnit}`
        : `Sửa nhóm ${current.code} → ${updated.code} · ${updated.name}`;
    await audit(user.id, "OIL_GROUP_UPDATE", "OilType", id, detail);
    return ok(updated);
  });
}

// PATCH body: { materialId } — tách riêng một mã khỏi nhóm hiện tại và đưa
// về danh sách "Chờ phân nhóm"; nhóm cùng các mã còn lại được giữ nguyên.
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được tách mã khỏi nhóm", 403);
    }

    const body = await req.json().catch(() => ({}));
    const materialId = String(body?.materialId ?? "").trim();
    if (!materialId) return fail("Thiếu id vật tư ERP");

    const material = await prisma.erpMaterial.findUnique({
      where: { id: materialId },
      select: { id: true, code: true, name: true, oilTypeId: true, mappingStatus: true, oilType: { select: { code: true, name: true } } },
    });
    if (!material) return fail("Không tìm thấy vật tư ERP", 404);
    if (!material.oilTypeId || material.mappingStatus !== "CONFIRMED") {
      return fail("Mã vật tư chưa được gom nhóm");
    }

    const oldGroupId = material.oilTypeId;
    const oldGroupLabel = material.oilType ? `${material.oilType.code} · ${material.oilType.name}` : oldGroupId;
    await prisma.$transaction(async (tx) => {
      await tx.erpMaterial.update({
        where: { id: materialId },
        data: {
          oilTypeId: null,
          mappingStatus: "UNMAPPED",
          conversionFactor: 1,
          suggestedOilTypeId: null,
          suggestedScore: null,
          suggestedReason: null,
        },
      });
      await tx.oilTypeMappingLog.create({
        data: {
          materialId,
          oilTypeId: oldGroupId,
          action: "REMOVED",
          reason: `Tách mã khỏi nhóm ${oldGroupLabel}`,
          userId: user.id,
        },
      });
    });

    await audit(user.id, "OIL_GROUP_MEMBER_REMOVE", "ErpMaterial", materialId, `Tách ${material.code} · ${material.name} khỏi nhóm ${oldGroupLabel}`);
    return ok({ materialId, oilTypeId: oldGroupId });
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được xoá nhóm vật tư", 403);
    }

    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return fail("Thiếu id nhóm");

    const group = await prisma.oilType.findUnique({
      where: { id },
      include: { materials: { select: { id: true } } },
    });
    if (!group) return fail("Không tìm thấy nhóm vật tư", 404);

    const memberIds = group.materials.map((m) => m.id);
    await prisma.$transaction(async (tx) => {
      if (memberIds.length > 0) {
        // Trả các mã trong nhóm về "Chờ phân nhóm"
        await tx.erpMaterial.updateMany({
          where: { id: { in: memberIds } },
          data: {
            oilTypeId: null,
            mappingStatus: "UNMAPPED",
            suggestedOilTypeId: null,
            suggestedScore: null,
            suggestedReason: null,
          },
        });
        await tx.oilTypeMappingLog.createMany({
          data: memberIds.map((materialId) => ({
            materialId,
            oilTypeId: null,
            action: "REMOVED",
            reason: `Xoá nhóm ${group.code} · ${group.name}`,
            userId: user.id,
          })),
        });
      }
      // Log cũ trỏ tới nhóm: FK ON DELETE SET NULL nên lịch sử vẫn giữ nguyên
      await tx.oilType.delete({ where: { id } });
    });

    await audit(user.id, "OIL_GROUP_DELETE", "OilType", id, `Xoá nhóm ${group.code} · ${group.name} (${memberIds.length} mã trở về chờ phân nhóm)`);
    return ok({ deleted: id, ungrouped: memberIds.length });
  });
}
