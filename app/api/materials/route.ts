import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { addMonths, DEFECT_UNITS } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { materialCatalogAccessWhere } from "@/lib/material-catalog-access";
import { assertSeqsInScope } from "@/lib/equipment-tree-scope";
import { maybeUploadDataUrl } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assignedPermissionLevel } from "@/lib/rbac-permissions";
import { positionCodeOf } from "@/lib/position-catalog";

export const dynamic = "force-dynamic";

const MATERIAL_INCLUDE = {
  deviceMaterials: {
    include: { device: { select: EQUIPMENT_DEVICE_SELECT } },
    orderBy: { usedAt: "desc" as const },
  },
  // Điểm dùng/thay thế: mỗi (vật tư × hệ thống/thiết bị) có chu kỳ + số lượng cần thay riêng.
  replacements: {
    // Phân biệt dòng khai báo (chưa có lịch sử) với điểm đã ghi nhận và chuyển vào lịch sử.
    // Cả hai đều có isActive=false, nhưng chỉ dòng khai báo được hiện ở bảng chi tiết.
    include: {
      // childCount phân biệt THƯ MỤC với thiết bị cấp cuối — SYC thay thế hiển thị
      // khác nhau ở hai trường hợp này (xem DefectMaterialRequestSeed.primaryIsFolder).
      device: { select: { ...EQUIPMENT_DEVICE_SELECT, childCount: true } },
      _count: { select: { logs: true } },
      // SYC thay thế đã ra cho điểm này — hiện chip tra cứu ngay trên bảng chi tiết.
      // Chỉ lấy phiếu mới nhất: bảng chỉ cần biết "đang có phiếu nào".
      defectRequests: {
        take: 3,
        orderBy: { createdAt: "desc" as const },
        select: {
          id: true,
          quantity: true,
          defect: {
            select: { id: true, requestNumber: true, requestType: true, status: true, cancelledAt: true },
          },
        },
      },
    },
    orderBy: { nextDueAt: "asc" as const },
  },
};

// Tab danh mục theo tổ máy: S1 | S2 | COMMON (giá trị khác coi như không hợp lệ).
function parseMachine(value: unknown) {
  return typeof value === "string" && (DEFECT_UNITS as readonly string[]).includes(value) ? value : null;
}

type MaterialDocumentFields = {
  documentUrl: string | null;
  documentName: string | null;
  erpCodes?: string[];
};

let materialDocumentColumnsReady = false;

async function ensureMaterialDocumentColumns() {
  if (materialDocumentColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Material"
    ADD COLUMN IF NOT EXISTS "documentUrl" TEXT,
    ADD COLUMN IF NOT EXISTS "documentName" TEXT
  `);
  materialDocumentColumnsReady = true;
}

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

async function materialDocumentMap(ids?: string[]) {
  try {
    await ensureMaterialDocumentColumns();
    // Chỉ quét đúng các vật tư cần trả về (khi có ids) thay vì cả bảng.
    if (ids && ids.length === 0) return new Map<string, MaterialDocumentFields>();
    const rows = ids
      ? await prisma.$queryRaw<Array<{ id: string; documentUrl: string | null; documentName: string | null; erpCodes: string[] | null }>>`
          SELECT "id", "documentUrl", "documentName", "erpCodes" FROM "Material" WHERE "id" = ANY(${ids}::text[])
        `
      : await prisma.$queryRaw<Array<{ id: string; documentUrl: string | null; documentName: string | null; erpCodes: string[] | null }>>`
          SELECT "id", "documentUrl", "documentName", "erpCodes" FROM "Material"
        `;
    return new Map(rows.map((row) => [row.id, { documentUrl: row.documentUrl, documentName: row.documentName, erpCodes: row.erpCodes ?? [] }]));
  } catch {
    return new Map<string, MaterialDocumentFields>();
  }
}

async function updateMaterialDocument(materialId: string, fields: MaterialDocumentFields) {
  if (!fields.documentUrl && !fields.documentName) return;
  await ensureMaterialDocumentColumns();
  await prisma.$executeRaw`
    UPDATE "Material"
    SET "documentUrl" = ${fields.documentUrl}, "documentName" = ${fields.documentName}
    WHERE "id" = ${materialId}
  `;
}

function mapMaterial<T extends { id?: string; quantity: number; deviceMaterials?: Array<any>; replacements?: Array<any> }>(
  material: T,
  document?: MaterialDocumentFields,
  parentNameBySeq?: Map<string, string>
) {
  const replacements = (material.replacements ?? []).map((r) => {
    const device = equipmentNodeToDevice(r.device);
    // "Hệ thống" của thiết bị = tên node cha trong cây (giống trang lý lịch thiết bị).
    if (device && r.device?.parentSeq) device.system = parentNameBySeq?.get(r.device.parentSeq) ?? null;
    // equipmentNodeToDevice không giữ childCount nên nâng lên thành cờ phẳng ở dòng điểm.
    return { ...r, deviceId: r.deviceSeq, device, deviceIsFolder: (r.device?.childCount ?? 0) > 0 };
  });
  // Tổng nhu cầu 1 chu kỳ = Σ (dung tích × số thiết bị) các DÒNG KHAI BÁO (isActive=false);
  // điểm theo dõi thời gian (isActive=true) là bản sao nên không cộng lặp.
  const totalNeed = replacements
    .filter((r) => !r.isActive)
    .reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.deviceCount) || 1), 0);
  const shortfall = Math.max(0, totalNeed - (Number(material.quantity) || 0));
  return {
    ...material,
    erpCodes: document?.erpCodes ?? (material as any).erpCodes ?? [String((material as any).code ?? "")].filter(Boolean),
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
  deviceCount?: unknown; // số lượng thiết bị tại điểm này
  managingPosition?: string | null; // cương vị quản lý điểm này
  isActive?: unknown; // true = đang theo dõi thời gian thay thế (bật từ panel chi tiết, KHÔNG bật khi thêm mới từ form)
  intervalMonths?: unknown;
  intervalNote?: string | null;
  quantity?: unknown;
  lastReplacedAt?: string | null;
};

/** Dựng dữ liệu tạo một điểm thay thế từ payload form (kèm tính ngày đến hạn). */
function buildReplacementCreate(entry: ReplacementInput, userId: string, defaultSystem: string | null, machine: string) {
  const parsedInterval = Math.round(Number(entry.intervalMonths));
  const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 12;
  const quantity = Math.max(0, Math.round(Number(entry.quantity)) || 0);
  const lastReplacedAt = entry.lastReplacedAt ? new Date(entry.lastReplacedAt) : null;
  return {
    // Đồng bộ tổ máy của điểm thay thế với tổ máy của vật tư — trang thiết bị lọc theo machine.
    machine,
    deviceSeq: entry.deviceSeq?.trim() || null,
    system: entry.system?.trim() || defaultSystem || null,
    location: entry.location?.trim() || null,
    deviceCount: Math.max(1, Math.round(Number(entry.deviceCount)) || 1),
    managingPosition: entry.managingPosition?.trim() || null,
    managingPositionCode: positionCodeOf(entry.managingPosition),
    // Thêm thiết bị theo dõi từ form KHÔNG tự kích hoạt đếm thời gian;
    // chỉ giữ trạng thái true khi dòng cũ đã được bật theo dõi trước đó.
    isActive: entry.isActive === true && intervalMonths > 0,
    quantity,
    intervalMonths,
    intervalNote: entry.intervalNote?.trim() || null,
    lastReplacedAt,
    nextDueAt: addMonths(lastReplacedAt ?? new Date(), intervalMonths),
    createdById: userId,
  };
}

/** Lọc các điểm hợp lệ (phải có thiết bị hoặc hệ thống) từ payload. */
function parseReplacements(body: { replacements?: unknown }, userId: string, defaultSystem: string | null, machine: string) {
  if (!Array.isArray(body.replacements)) return [];
  const rows = body.replacements
    .filter((r: ReplacementInput) =>
      r && (String(r.deviceSeq ?? "").trim() || String(r.system ?? "").trim() || String(r.location ?? "").trim()))
    .map((r: ReplacementInput) => buildReplacementCreate(r, userId, defaultSystem, machine));
  // Tổ máy của vật tư quyết định CÂY thiết bị được phép gán (S1/S2 → nhánh 1,2,3,7; COMMON → 5,6).
  assertSeqsInScope(rows.map((r) => r.deviceSeq), machine);
  return rows;
}

function parseErpCodes(body: { code?: unknown; erpCodes?: unknown }) {
  const values = Array.isArray(body.erpCodes) ? body.erpCodes : [body.code];
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))
  );
}

async function materialWithAnyErpCode(erpCodes: string[], excludeId?: string, machine?: string) {
  if (!erpCodes.length) return null;
  // Khi có machine, chỉ kiểm tra trùng trong cùng tổ máy (dùng cho PUT).
  // Khi không có machine, kiểm tra toàn bộ (dùng cho POST kiểm tra global).
  const rows = excludeId
    ? machine
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Material"
          WHERE "id" <> ${excludeId}
            AND "machine" = ${machine}
            AND ("code" = ANY(${erpCodes}::text[]) OR "erpCodes" && ${erpCodes}::text[])
          LIMIT 1
        `
      : await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Material"
          WHERE "id" <> ${excludeId}
            AND ("code" = ANY(${erpCodes}::text[]) OR "erpCodes" && ${erpCodes}::text[])
          LIMIT 1
        `
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Material"
        WHERE "code" = ANY(${erpCodes}::text[]) OR "erpCodes" && ${erpCodes}::text[]
        LIMIT 1
      `;
  return rows[0] ?? null;
}

async function updateMaterialErpCodes(materialId: string, erpCodes: string[]) {
  await prisma.$executeRaw`
    UPDATE "Material"
    SET "erpCodes" = ${erpCodes}::text[]
    WHERE "id" = ${materialId}
  `;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const materialPermission = await assignedPermissionLevel(user, "material-manage");
    if (materialPermission === "none") return fail("Không đủ quyền xem Danh mục Vận Hành 1", 403);
    // ?machine=S1|S2|COMMON: lọc theo tổ máy ngay trong query (tab Danh mục vật tư).
    // ?include=usage: kèm lịch sử tiêu hao theo thiết bị (chỉ trang Reports cần).
    const machine = parseMachine(req.nextUrl.searchParams.get("machine"));
    const includeUsage = req.nextUrl.searchParams.get("include") === "usage";
    const access = await resolveEquipmentAccessForUser(user);
    const materialAccess = materialCatalogAccessWhere(access);

    const materials = await prisma.material.findMany({
      where: {
        ...(machine ? { machine } : {}),
        // Vật tư chỉ xuất hiện khi có ít nhất một thiết bị đã khai báo trong phạm
        // vi Xem/Sửa của cương vị hiện tại.
        replacements: { some: materialAccess.declaration },
      },
      orderBy: { code: "asc" },
      include: {
        replacements: {
          ...MATERIAL_INCLUDE.replacements,
          where: materialAccess.replacement,
        },
        ...(includeUsage
          ? {
              deviceMaterials: {
                ...MATERIAL_INCLUDE.deviceMaterials,
                where: materialAccess.usage,
              },
            }
          : {}),
      },
    });
    const documents = await materialDocumentMap(materials.map((material) => material.id));
    // Tra tên node cha 1 lần cho mọi thiết bị của các điểm thay thế → cột "Hệ thống".
    const parentSeqs = Array.from(
      new Set(
        materials.flatMap((material) =>
          (material.replacements ?? []).map((r) => r.device?.parentSeq).filter((seq): seq is string => Boolean(seq))
        )
      )
    );
    const parentNodes = parentSeqs.length
      ? await prisma.equipmentNode.findMany({ where: { seq: { in: parentSeqs } }, select: { seq: true, name: true } })
      : [];
    const parentNameBySeq = new Map(parentNodes.map((node) => [node.seq, node.name]));
    // Danh sách tổ máy mà vật tư (cùng code) đang tồn tại — form Cập nhật dùng để tick sẵn.
    const codes = Array.from(new Set(materials.map((material) => material.code)));
    const siblingRows = codes.length
      ? await prisma.material.findMany({ where: { code: { in: codes } }, select: { code: true, machine: true } })
      : [];
    const machinesByCode = new Map<string, string[]>();
    for (const row of siblingRows) {
      const list = machinesByCode.get(row.code);
      if (list) {
        if (!list.includes(row.machine)) list.push(row.machine);
      } else machinesByCode.set(row.code, [row.machine]);
    }
    const data = materials.map((material) => ({
      ...mapMaterial(material, documents.get(material.id), parentNameBySeq),
      machines: machinesByCode.get(material.code) ?? [material.machine],
    }));
    return ok(data, {
      total: data.length,
      equipmentScopeApplied: access.hasExplicitScopes,
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["personal", "manage", "full"], "Không đủ quyền thêm vật tư");
    const body = await req.json();
    const erpCodes = parseErpCodes(body);
    const primaryCode = erpCodes[0];
    if (!primaryCode || !body.name || !body.unit) return fail("Thiếu thông tin bắt buộc");
    const exists = await materialWithAnyErpCode(erpCodes);
    if (exists) return fail("Mã vật tư ERP đã được gom trong Danh mục vật tư PXVH1");
    const defaultSystem = body.system?.trim() || null;
    // Điểm dùng/thay thế chỉ gắn vào tổ máy chính — đồng bộ machine của điểm với tổ máy đó.
    const primaryMachineForReplacements = parseMachine(body.machine) ?? "COMMON";
    const replacements = parseReplacements(body, user.id, defaultSystem, primaryMachineForReplacements);
    const imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" });
    const document = await normalizeMaterialDocument(body);
    const syncAll = body.syncAll === true;
    const requestedMachines: string[] = Array.isArray(body.machines)
      ? body.machines.filter((m: unknown) => typeof m === "string" && (DEFECT_UNITS as readonly string[]).includes(m as string))
      : [];
    const machines = requestedMachines.length
      ? requestedMachines
      : syncAll
        ? ["S1", "S2", "COMMON"]
        : [parseMachine(body.machine) ?? "COMMON"];
    const sharedData = {
      code: primaryCode,
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
    };
    // Tổ máy chính (nhận điểm dùng/thay thế): lấy theo tab đang chọn hoặc fallback "COMMON".
    const primaryMachine = parseMachine(body.machine) ?? "COMMON";
    let firstMaterial: any = null;
    for (const machine of machines) {
      // Chỉ tổ máy chính nhận điểm dùng/thay thế (vì gắn thiết bị cụ thể của tổ máy đó).
      const isMachineWithReplacements = machine === primaryMachine;
      const m = await prisma.material.create({
        data: {
          ...sharedData,
          machine,
          ...(isMachineWithReplacements && replacements.length ? { replacements: { create: replacements } } : {}),
        },
        include: MATERIAL_INCLUDE,
      });
      await updateMaterialErpCodes(m.id, erpCodes);
      await updateMaterialDocument(m.id, document);
      await audit(user.id, "CREATE_MATERIAL", "Material", m.id, auditDetailWithPosition(user, `${m.code} (${machine})`));
      if (!firstMaterial) firstMaterial = m;
    }
    return ok(mapMaterial(firstMaterial, { ...document, erpCodes }));
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền cập nhật vật tư");
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    const erpCodes = body.erpCodes !== undefined || body.code !== undefined ? parseErpCodes(body) : undefined;
    const primaryCode = erpCodes?.[0];
    if (erpCodes && !primaryCode) return fail("Vui lòng chọn ít nhất một mã vật tư ERP");
    // Lấy tổ máy hiện tại của bản ghi để scope duplicate check đúng tổ máy.
    const currentMaterial = await prisma.material.findUnique({ where: { id: body.id }, select: { machine: true, code: true } });
    if (!currentMaterial) return fail("Không tìm thấy vật tư", 404);
    if (erpCodes?.length) {
      const exists = await materialWithAnyErpCode(erpCodes, body.id, currentMaterial.machine);
      if (exists) return fail("Mã vật tư ERP đã được gom trong Danh mục vật tư PXVH1");
    }
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
        ...(primaryCode ? { code: primaryCode } : {}),
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.unit != null ? { unit: body.unit } : {}),
        ...(body.quantity != null ? { quantity: Number(body.quantity) } : {}),
        ...(body.minStock != null ? { minStock: Number(body.minStock) } : {}),
        ...(defaultSystem !== undefined ? { system: defaultSystem } : {}),
        ...(body.category !== undefined ? { category: body.category?.trim() || null } : {}),
        ...(body.machine !== undefined ? { machine: parseMachine(body.machine) ?? "COMMON" } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl } : {}),
        ...(body.unitPrice != null ? { unitPrice: Number(body.unitPrice) } : {}),
        ...(body.note !== undefined ? { note: body.note || null } : {}),
      },
    });
    if (erpCodes) {
      await updateMaterialErpCodes(body.id, erpCodes);
    }
    if (document !== undefined) {
      await updateMaterialDocument(body.id, document);
    }
    // Đồng bộ DÒNG KHAI BÁO thiết bị (isActive=false) theo form: xoá rồi tạo lại.
    // Các ĐIỂM THEO DÕI thời gian (isActive=true, tạo từ nút "Thêm điểm") GIỮ NGUYÊN.
    if (Array.isArray(body.replacements)) {
      const current = await prisma.material.findUnique({ where: { id: body.id }, select: { system: true } });
      const replacements = parseReplacements(body, user.id, defaultSystem ?? current?.system ?? null, currentMaterial.machine);
      await prisma.materialReplacement.deleteMany({ where: { materialId: body.id, isActive: false } });
      for (const data of replacements) {
        await prisma.materialReplacement.create({
          data: {
            ...data,
            materialId: body.id,
          },
        });
      }
    }
    // Đồng bộ danh sách TỔ MÁY được tick (multi-select ở form Cập nhật): vật tư
    // tồn tại đúng trên các tổ máy đã chọn — tạo dòng sibling còn thiếu (copy thông
    // tin chung + mã ERP + tài liệu); dòng bỏ tick chỉ xoá khi không còn điểm
    // khai báo/theo dõi để tránh mất dữ liệu.
    const requestedMachines: string[] | undefined = Array.isArray(body.machines)
      ? Array.from(
          new Set(
            body.machines.filter(
              (m: unknown): m is string => typeof m === "string" && (DEFECT_UNITS as readonly string[]).includes(m)
            )
          )
        )
      : undefined;
    if (requestedMachines !== undefined) {
      if (!requestedMachines.length) return fail("Vui lòng chọn ít nhất một tổ máy");
      const main = await prisma.material.findUnique({ where: { id: body.id } });
      if (main) {
        const siblings = await prisma.material.findMany({ where: { code: main.code }, select: { id: true, machine: true } });
        const existingMachines = new Set(siblings.map((s) => s.machine));
        for (const machineKey of requestedMachines) {
          if (existingMachines.has(machineKey)) continue;
          const created = await prisma.material.create({
            data: {
              code: main.code,
              name: main.name,
              unit: main.unit,
              quantity: main.quantity,
              minStock: main.minStock,
              location: main.location,
              system: main.system,
              category: main.category,
              imageUrl: main.imageUrl,
              unitPrice: main.unitPrice,
              note: main.note,
              machine: machineKey,
            },
          });
          // Copy mã ERP + tài liệu (cột raw ngoài schema Prisma).
          await ensureMaterialDocumentColumns();
          await prisma.$executeRaw`
            UPDATE "Material" SET "erpCodes" = src."erpCodes", "documentUrl" = src."documentUrl", "documentName" = src."documentName"
            FROM "Material" src WHERE src."id" = ${main.id} AND "Material"."id" = ${created.id}
          `;
          await audit(user.id, "CREATE_MATERIAL", "Material", created.id, auditDetailWithPosition(user, `${main.code} (${machineKey})`));
        }
        for (const sibling of siblings) {
          if (requestedMachines.includes(sibling.machine)) continue;
          const points = await prisma.materialReplacement.count({ where: { materialId: sibling.id } });
          if (points > 0) {
            return fail(
              `Không thể bỏ Tổ máy ${sibling.machine}: còn ${points} điểm khai báo/theo dõi ở tổ máy này — xoá các điểm trước khi bỏ chọn.`
            );
          }
          await prisma.equipmentMaterial.deleteMany({ where: { materialId: sibling.id } });
          await prisma.material.delete({ where: { id: sibling.id } });
          await audit(user.id, "DELETE_MATERIAL", "Material", sibling.id, auditDetailWithPosition(user, `${main.code} (${sibling.machine})`));
        }
      }
    }
    // Đồng bộ quantity sang các bản ghi sibling (cùng code, khác machine).
    if (body.quantity != null) {
      const updated = await prisma.material.findUnique({ where: { id: body.id }, select: { code: true, machine: true } });
      if (updated) {
        await prisma.material.updateMany({
          where: { code: updated.code, machine: { not: updated.machine } },
          data: { quantity: Number(body.quantity) },
        });
      }
    }
    const m = await prisma.material.findUnique({ where: { id: body.id }, include: MATERIAL_INCLUDE });
    await audit(user.id, "UPDATE_MATERIAL", "Material", body.id, auditDetailWithPosition(user, m?.code));
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
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền xoá vật tư");

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
    await audit(user.id, "DELETE_MATERIAL", "Material", foundIds.join(","), auditDetailWithPosition(user, materials.map((m) => m.code).join(", ")));
    return ok({ ids: foundIds, count });
  });
}
