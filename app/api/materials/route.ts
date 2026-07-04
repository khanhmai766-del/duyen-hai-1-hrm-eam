import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { addMonths } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { maybeUploadDataUrl } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const MATERIAL_INCLUDE = {
  deviceMaterials: {
    include: { device: { select: EQUIPMENT_DEVICE_SELECT } },
    orderBy: { usedAt: "desc" as const },
  },
  // Điểm dùng/thay thế: mỗi (vật tư × hệ thống/thiết bị) có chu kỳ + số lượng cần thay riêng.
  replacements: {
    include: { device: { select: EQUIPMENT_DEVICE_SELECT } },
    orderBy: { nextDueAt: "asc" as const },
  },
};

type MaterialDocumentFields = {
  documentUrl: string | null;
  documentName: string | null;
};

async function normalizeMaterialDocument(body: { documentUrl?: unknown; documentName?: unknown }): Promise<MaterialDocumentFields> {
  // Tầng 3: dán data URL cũng được đẩy lên MinIO; DB chỉ giữ URL ngắn.
  const documentUrl = await maybeUploadDataUrl({
    value: String(body.documentUrl ?? "").trim() || null,
    folder: "materials/documents",
    preset: "document-image",
  });
  const documentName = String(body.documentName ?? "").trim() || null;
  return { documentUrl, documentName: documentUrl ? documentName : null };
}

async function materialDocumentMap() {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; documentUrl: string | null; documentName: string | null }>>`
      SELECT "id", "documentUrl", "documentName" FROM "Material"
    `;
    return new Map(rows.map((row) => [row.id, { documentUrl: row.documentUrl, documentName: row.documentName }]));
  } catch {
    return new Map<string, MaterialDocumentFields>();
  }
}

async function updateMaterialDocument(materialId: string, fields: MaterialDocumentFields) {
  await prisma.$executeRaw`
    UPDATE "Material"
    SET "documentUrl" = ${fields.documentUrl}, "documentName" = ${fields.documentName}
    WHERE "id" = ${materialId}
  `;
}

function mapMaterial<T extends { id?: string; quantity: number; deviceMaterials?: Array<any>; replacements?: Array<any> }>(
  material: T,
  document?: MaterialDocumentFields
) {
  const replacements = (material.replacements ?? []).map((r) => ({
    ...r,
    deviceId: r.deviceSeq,
    device: equipmentNodeToDevice(r.device),
  }));
  // Tổng nhu cầu 1 chu kỳ = Σ số lượng tất cả điểm thay thế; đề xuất thêm = thiếu hụt so với tồn kho.
  const totalNeed = replacements.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const shortfall = Math.max(0, totalNeed - (Number(material.quantity) || 0));
  return {
    ...material,
    documentUrl: document?.documentUrl ?? null,
    documentName: document?.documentName ?? null,
    deviceMaterials: material.deviceMaterials?.map((dm) => ({
      ...dm,
      deviceId: dm.deviceSeq,
      device: equipmentNodeToDevice(dm.device),
    })),
    replacements,
    totalNeed,
    shortfall,
  };
}

type ReplacementInput = {
  deviceSeq?: string | null;
  system?: string | null;
  location?: string | null; // tên thiết bị nhập tay (khi không chọn từ cây)
  intervalMonths?: unknown;
  intervalNote?: string | null;
  quantity?: unknown;
  lastReplacedAt?: string | null;
};

/** Dựng dữ liệu tạo một điểm thay thế từ payload form (kèm tính ngày đến hạn). */
function buildReplacementCreate(entry: ReplacementInput, userId: string, defaultSystem: string | null) {
  const intervalMonths = Math.max(1, Math.round(Number(entry.intervalMonths)) || 12);
  const quantity = Math.max(0, Math.round(Number(entry.quantity)) || 0);
  const lastReplacedAt = entry.lastReplacedAt ? new Date(entry.lastReplacedAt) : null;
  return {
    deviceSeq: entry.deviceSeq?.trim() || null,
    system: entry.system?.trim() || defaultSystem || null,
    location: entry.location?.trim() || null,
    quantity,
    intervalMonths,
    intervalNote: entry.intervalNote?.trim() || null,
    lastReplacedAt,
    nextDueAt: addMonths(lastReplacedAt ?? new Date(), intervalMonths),
    createdById: userId,
  };
}

/** Lọc các điểm hợp lệ (phải có thiết bị hoặc hệ thống) từ payload. */
function parseReplacements(body: { replacements?: unknown }, userId: string, defaultSystem: string | null) {
  if (!Array.isArray(body.replacements)) return [];
  return body.replacements
    .filter((r: ReplacementInput) =>
      r && (String(r.deviceSeq ?? "").trim() || String(r.system ?? "").trim() || String(r.location ?? "").trim()))
    .map((r: ReplacementInput) => buildReplacementCreate(r, userId, defaultSystem));
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const materials = await prisma.material.findMany({
      orderBy: { code: "asc" },
      include: MATERIAL_INCLUDE,
    });
    const documents = await materialDocumentMap();
    const data = materials.map((material) => mapMaterial(material, documents.get(material.id)));
    const filtered = access.hasExplicitScopes
      ? data
          .map((material) => {
            const deviceMaterials = (material.deviceMaterials ?? []).filter((item: any) => access.canViewSeq(item.deviceSeq));
            const replacements = (material.replacements ?? []).filter((item: any) => {
              if (item.deviceSeq) return access.canViewSeq(item.deviceSeq);
              if (item.system) return access.visibleSystemNames.has(normalizeText(item.system));
              return false;
            });
            return { ...material, deviceMaterials, replacements };
          })
          .filter((material) => {
            if ((material.deviceMaterials ?? []).length || (material.replacements ?? []).length) return true;
            return material.system ? access.visibleSystemNames.has(normalizeText(material.system)) : false;
          })
      : data;
    return ok(filtered, { total: filtered.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["create", "manage", "full"], "Không đủ quyền thêm vật tư");
    const body = await req.json();
    if (!body.code || !body.name || !body.unit) return fail("Thiếu thông tin bắt buộc");
    const exists = await prisma.material.findUnique({ where: { code: body.code } });
    if (exists) return fail("Mã vật tư đã tồn tại");
    const defaultSystem = body.system?.trim() || null;
    const replacements = parseReplacements(body, user.id, defaultSystem);
    const imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" });
    const document = await normalizeMaterialDocument(body);
    const m = await prisma.material.create({
      data: {
        code: body.code,
        name: body.name,
        unit: body.unit,
        quantity: Number(body.quantity) || 0,
        minStock: Number(body.minStock) || 0,
        location: null,
        system: defaultSystem,
        category: body.category?.trim() || null,
        imageUrl,
        unitPrice: body.unitPrice != null ? Number(body.unitPrice) : null,
        note: body.note || null,
        ...(replacements.length ? { replacements: { create: replacements } } : {}),
      },
      include: MATERIAL_INCLUDE,
    });
    await updateMaterialDocument(m.id, document);
    await audit(user.id, "CREATE_MATERIAL", "Material", m.id, m.code);
    return ok(mapMaterial(m, document));
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền cập nhật vật tư");
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    const defaultSystem = body.system !== undefined ? body.system?.trim() || null : undefined;
    const imageUrl =
      body.imageUrl !== undefined
        ? await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" })
        : undefined;
    const document = body.documentUrl !== undefined || body.documentName !== undefined
      ? await normalizeMaterialDocument(body)
      : undefined;
    await prisma.material.update({
      where: { id: body.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.unit != null ? { unit: body.unit } : {}),
        ...(body.quantity != null ? { quantity: Number(body.quantity) } : {}),
        ...(body.minStock != null ? { minStock: Number(body.minStock) } : {}),
        ...(defaultSystem !== undefined ? { system: defaultSystem } : {}),
        ...(body.category !== undefined ? { category: body.category?.trim() || null } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl } : {}),
        ...(body.unitPrice != null ? { unitPrice: Number(body.unitPrice) } : {}),
        ...(body.note !== undefined ? { note: body.note || null } : {}),
      },
    });
    if (document !== undefined) {
      await updateMaterialDocument(body.id, document);
    }
    // Đồng bộ điểm thay thế (chỉ khi payload có gửi mảng replacements): xoá hết rồi tạo lại theo form.
    if (Array.isArray(body.replacements)) {
      const current = await prisma.material.findUnique({ where: { id: body.id }, select: { system: true } });
      const replacements = parseReplacements(body, user.id, defaultSystem ?? current?.system ?? null);
      await prisma.materialReplacement.deleteMany({ where: { materialId: body.id } });
      for (const data of replacements) {
        await prisma.materialReplacement.create({ data: { ...data, materialId: body.id } });
      }
    }
    const m = await prisma.material.findUnique({ where: { id: body.id }, include: MATERIAL_INCLUDE });
    await audit(user.id, "UPDATE_MATERIAL", "Material", body.id, m?.code ?? "");
    return ok(m ? mapMaterial(m, document ?? (await materialDocumentMap()).get(body.id)) : null);
  });
}

/**
 * DELETE /api/materials — xoá vật tư (Quản trị / Quản lý).
 *  - Một vật tư:  ?id=<id>
 *  - Nhiều vật tư: body JSON { ids: string[] }
 */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["full"], "Không đủ quyền xoá vật tư");

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
    await prisma.equipmentMaterial.deleteMany({ where: { materialId: { in: foundIds } } });
    const { count } = await prisma.material.deleteMany({ where: { id: { in: foundIds } } });
    await audit(user.id, "DELETE_MATERIAL", "Material", foundIds.join(","), materials.map((m) => m.code).join(", "));
    return ok({ ids: foundIds, count });
  });
}
