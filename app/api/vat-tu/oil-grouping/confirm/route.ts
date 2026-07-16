// POST /api/vat-tu/oil-grouping/confirm
// Người duyệt xác nhận gom mã vào nhóm (có sẵn hoặc tạo mới),
// hoặc đánh dấu IGNORED. Mapping lưu vĩnh viễn + audit log.
//
// Body:
// { materialIds: string[],
//   action: "CONFIRM" | "IGNORE",
//   oilTypeId?: string,                                         // gom vào nhóm có sẵn
//   newOilType?: { code, name, baseUnit, minStock?, category }, // hoặc tạo nhóm mới
//   conversionFactor?: number }                                 // quy đổi ĐVT nếu khác baseUnit
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { isGroupableCategory, STANDALONE_GROUP_PREFIX } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được duyệt gom nhóm dầu", 403);
    }

    const body = await req.json();
    const { materialIds, action, oilTypeId, newOilType, conversionFactor } = body ?? {};

    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return fail("Thiếu danh sách mã vật tư (materialIds)");
    }

    // Mỗi mã là một nhóm độc lập, dùng tên và ĐVT của chính vật tư.
    if (action === "SINGLE") {
      const result = await prisma.$transaction(async (tx) => {
        const materials = await tx.erpMaterial.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, name: true, unit: true, category: true },
        });
        if (materials.length !== materialIds.length) throw fail("Có mã vật tư không tồn tại");

        for (const material of materials) {
          const category = material.category ?? "Dầu bôi trơn";
          if (!isGroupableCategory(category)) throw fail(`Loại vật tư của "${material.name}" không hợp lệ`);
          const code = `${STANDALONE_GROUP_PREFIX}${material.id}`;
          const group = await tx.oilType.upsert({
            where: { code },
            create: { code, name: material.name, baseUnit: material.unit, category },
            update: { name: material.name, baseUnit: material.unit, category },
          });
          await tx.erpMaterial.update({
            where: { id: material.id },
            data: {
              oilTypeId: group.id,
              mappingStatus: "CONFIRMED",
              conversionFactor: 1,
              suggestedOilTypeId: null,
              suggestedScore: null,
              suggestedReason: null,
            },
          });
          await tx.oilTypeMappingLog.create({
            data: {
              materialId: material.id,
              oilTypeId: group.id,
              action: "CONFIRMED",
              userId: user.id,
              reason: "Vật tư không cần gom — tạo nhóm riêng",
            },
          });
        }
        return { confirmed: materials.length };
      });
      await audit(user.id, "OIL_GROUPING_SINGLE", "ErpMaterial", undefined, `Tạo ${result.confirmed} nhóm vật tư riêng`);
      return ok(result);
    }

    // ---------- BỎ QUA (không phải dầu) ----------
    if (action === "IGNORE") {
      await prisma.$transaction([
        prisma.erpMaterial.updateMany({
          where: { id: { in: materialIds } },
          data: {
            mappingStatus: "IGNORED",
            oilTypeId: null,
            suggestedOilTypeId: null,
            suggestedScore: null,
            suggestedReason: null,
          },
        }),
        prisma.oilTypeMappingLog.createMany({
          data: materialIds.map((id: string) => ({
            materialId: id,
            action: "IGNORED",
            userId: user.id,
          })),
        }),
      ]);
      await audit(user.id, "OIL_GROUPING_IGNORE", "ErpMaterial", undefined, `Bỏ qua ${materialIds.length} mã (không phải dầu)`);
      return ok({ ignored: materialIds.length });
    }

    // ---------- XÁC NHẬN GOM NHÓM ----------
    if (action !== "CONFIRM") return fail("action không hợp lệ");

    const factor = Number(conversionFactor) > 0 ? Number(conversionFactor) : 1;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Xác định nhóm đích: có sẵn hoặc tạo mới
      let targetId = oilTypeId as string | undefined;
      if (!targetId) {
        if (!newOilType?.code || !newOilType?.name || !newOilType?.baseUnit) {
          throw fail("Thiếu thông tin nhóm mới (mã, tên, ĐVT chuẩn)");
        }
        if (!isGroupableCategory(newOilType.category)) {
          throw fail("Loại vật tư của nhóm mới không hợp lệ");
        }
        const code = String(newOilType.code).trim().toUpperCase();
        const existed = await tx.oilType.findUnique({ where: { code } });
        if (existed) throw fail(`Mã nhóm "${code}" đã tồn tại — chọn nhóm có sẵn hoặc dùng mã khác`);
        const created = await tx.oilType.create({
          data: {
            code,
            name: String(newOilType.name).trim(),
            baseUnit: String(newOilType.baseUnit).trim(),
            minStock: newOilType.minStock != null ? Number(newOilType.minStock) : null,
            category: newOilType.category,
          },
        });
        targetId = created.id;
      }

      // 2. Kiểm tra loại + ĐVT
      const target = await tx.oilType.findUnique({ where: { id: targetId } });
      if (!target) throw fail("Không tìm thấy nhóm vật tư đích", 404);
      if (target.code.startsWith(STANDALONE_GROUP_PREFIX)) {
        throw fail("Đây là nhóm riêng của một vật tư, không thể gom thêm mã khác");
      }
      const mats = await tx.erpMaterial.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, unit: true, category: true },
      });
      if (mats.length !== materialIds.length) throw fail("Có mã vật tư không tồn tại");

      // Mã phải cùng loại vật tư với nhóm đích (mã chưa phân loại tính là Dầu bôi trơn)
      const wrongCategory = mats.filter((m) => (m.category ?? "Dầu bôi trơn") !== target.category);
      if (wrongCategory.length > 0) {
        throw fail(`${wrongCategory.length} mã không thuộc loại "${target.category}" — không thể gom vào nhóm này`);
      }
      const unitMismatch = mats.filter(
        (m) => m.unit.trim().toLowerCase() !== target.baseUnit.trim().toLowerCase()
      );
      if (unitMismatch.length > 0 && factor === 1) {
        throw fail(
          `ĐVT khác "${target.baseUnit}" ở ${unitMismatch.length} mã — cần nhập hệ số quy đổi`
        );
      }

      // 3. Gom nhóm + xóa gợi ý treo
      await tx.erpMaterial.updateMany({
        where: { id: { in: materialIds } },
        data: {
          oilTypeId: targetId,
          mappingStatus: "CONFIRMED",
          conversionFactor: factor,
          suggestedOilTypeId: null,
          suggestedScore: null,
          suggestedReason: null,
        },
      });

      // 4. Audit trail nghiệp vụ
      await tx.oilTypeMappingLog.createMany({
        data: materialIds.map((id: string) => ({
          materialId: id,
          oilTypeId: targetId!,
          action: "CONFIRMED",
          userId: user.id,
          reason: oilTypeId ? "Duyệt gợi ý / gom vào nhóm có sẵn" : `Tạo nhóm mới ${target.code}`,
        })),
      });

      return { oilTypeId: targetId, code: target.code, confirmed: materialIds.length };
    });

    await audit(user.id, "OIL_GROUPING_CONFIRM", "OilType", result.oilTypeId, `Gom ${result.confirmed} mã vào loại dầu ${result.code}`);
    return ok(result);
  });
}
