import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const materials = await prisma.material.findMany({
      orderBy: { code: "asc" },
      include: {
        deviceMaterials: {
          include: { device: { select: { id: true, code: true, name: true, system: true, managingPosition: true } } },
          orderBy: { usedAt: "desc" },
        },
      },
    });
    return ok(materials, { total: materials.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    if (!body.code || !body.name || !body.unit) return fail("Thiếu thông tin bắt buộc");
    const exists = await prisma.material.findUnique({ where: { code: body.code } });
    if (exists) return fail("Mã vật tư đã tồn tại");
    const m = await prisma.material.create({
      data: {
        code: body.code,
        name: body.name,
        unit: body.unit,
        quantity: Number(body.quantity) || 0,
        minStock: Number(body.minStock) || 0,
        location: null,
        system: body.system || null,
        imageUrl: body.imageUrl || null,
        supplier: body.supplier || null,
        unitPrice: body.unitPrice != null ? Number(body.unitPrice) : null,
        note: body.note || null,
        ...(body.deviceId
          ? {
              deviceMaterials: {
                create: {
                  deviceId: body.deviceId,
                  quantity: 1,
                },
              },
            }
          : {}),
      },
    });
    await audit(user.id, "CREATE_MATERIAL", "Material", m.id, m.code);
    return ok(m);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    const m = await prisma.material.update({
      where: { id: body.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.quantity != null ? { quantity: Number(body.quantity) } : {}),
        ...(body.minStock != null ? { minStock: Number(body.minStock) } : {}),
        location: null,
        ...(body.system !== undefined ? { system: body.system || null } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl || null } : {}),
        ...(body.supplier !== undefined ? { supplier: body.supplier } : {}),
        ...(body.unitPrice != null ? { unitPrice: Number(body.unitPrice) } : {}),
        ...(body.note !== undefined ? { note: body.note || null } : {}),
      },
    });
    if (body.deviceId !== undefined) {
      await prisma.deviceMaterial.deleteMany({ where: { materialId: m.id } });
      if (body.deviceId) {
        await prisma.deviceMaterial.create({
          data: {
            materialId: m.id,
            deviceId: body.deviceId,
            quantity: 1,
          },
        });
      }
    }
    await audit(user.id, "UPDATE_MATERIAL", "Material", m.id, m.code);
    return ok(m);
  });
}

/**
 * DELETE /api/materials — xoá vật tư (chỉ ADMIN).
 *  - Một vật tư:  ?id=<id>
 *  - Nhiều vật tư: body JSON { ids: string[] }
 */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);

    // Gom danh sách id cần xoá từ query (đơn) hoặc body (hàng loạt).
    const single = req.nextUrl.searchParams.get("id");
    let ids: string[] = single ? [single] : [];
    if (!ids.length) {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.ids)) ids = body.ids.filter((x: unknown) => typeof x === "string");
    }
    if (!ids.length) return fail("Thiếu id vật tư");

    const materials = await prisma.material.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } });
    if (!materials.length) return fail("Không tìm thấy vật tư", 404);
    const foundIds = materials.map((m) => m.id);

    // Gỡ liên kết tiêu hao (lịch sử dùng cho thiết bị) trước khi xoá vật tư.
    await prisma.deviceMaterial.deleteMany({ where: { materialId: { in: foundIds } } });
    const { count } = await prisma.material.deleteMany({ where: { id: { in: foundIds } } });
    await audit(user.id, "DELETE_MATERIAL", "Material", foundIds.join(","), materials.map((m) => m.code).join(", "));
    return ok({ ids: foundIds, count });
  });
}
