import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { COMMON_MATERIAL_POSITION, isOtherMaterialCategory, OTHER_MATERIAL_CATEGORIES } from "@/lib/constants";
import { getWorkflowRoleMap, stepAllowedWithMap } from "@/lib/material-workflow";
import { positionsMatch } from "@/lib/position-catalog";
import { consumeOtherMaterial } from "@/lib/other-material-stock";
import { parseDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MATERIAL_INCLUDE = {
  replacements: {
    select: {
      id: true,
      deviceSeq: true,
      managingPosition: true,
      location: true,
      system: true,
      device: { select: { seq: true, name: true, kks: true } },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const workflow = await getWorkflowRoleMap();
    const requestedPage = Number(req.nextUrl.searchParams.get("page") || 1);
    const requestedPageSize = Number(req.nextUrl.searchParams.get("pageSize") || 20);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(50, Math.max(10, requestedPageSize)) : 20;
    const historySearch = String(req.nextUrl.searchParams.get("search") || "").trim().slice(0, 120);
    const movementWhere: Prisma.MaterialStockMovementWhereInput = {
      material: { category: { in: [...OTHER_MATERIAL_CATEGORIES, "Chai khí"] } },
      ...(historySearch ? {
        OR: [
          { material: { code: { contains: historySearch, mode: "insensitive" } } },
          { material: { name: { contains: historySearch, mode: "insensitive" } } },
          { receiverName: { contains: historySearch, mode: "insensitive" } },
          { issuerName: { contains: historySearch, mode: "insensitive" } },
          { createdByName: { contains: historySearch, mode: "insensitive" } },
          { assignedPosition: { contains: historySearch, mode: "insensitive" } },
          { deviceSeq: { contains: historySearch, mode: "insensitive" } },
          { note: { contains: historySearch, mode: "insensitive" } },
          { erpCodes: { has: historySearch } },
        ],
      } : {}),
    };

    const [materials, movements, movementTotal, users] = await Promise.all([
      prisma.material.findMany({
        where: { category: { in: [...OTHER_MATERIAL_CATEGORIES, "Chai khí"] } },
        include: MATERIAL_INCLUDE,
        orderBy: [{ name: "asc" }, { machine: "asc" }],
      }),
      prisma.materialStockMovement.findMany({
        where: movementWhere,
        include: { material: { select: { id: true, code: true, name: true, unit: true, category: true, machine: true } } },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.materialStockMovement.count({ where: movementWhere }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, position: true, currentPosition: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const canManageUse = stepAllowedWithMap(workflow, "use", user);
    const rows = materials.map((material) => {
      const positions = Array.from(new Set(material.replacements.map((row) => row.managingPosition?.trim()).filter(Boolean) as string[]));
      const allowedUsePositions = canManageUse ? positions : positions.filter((position) => positionsMatch(position, user.position));
      const devices = material.replacements
        .filter((row) => row.deviceSeq)
        .map((row) => ({
          seq: row.deviceSeq!,
          name: row.device?.name || row.location || row.system || row.deviceSeq!,
          kks: row.device?.kks ?? null,
          managingPosition: row.managingPosition,
        }));
      return {
        id: material.id,
        code: material.code,
        erpCodes: material.erpCodes.length ? material.erpCodes : [material.code],
        name: material.name,
        unit: material.unit,
        category: material.category,
        machine: material.machine,
        location: material.location,
        quantity: material.quantity,
        scope: positions.length || devices.length ? "POSITION" : "COMMON",
        positions,
        allowedUsePositions,
        devices,
        canUse: allowedUsePositions.length > 0,
      };
    });

    return ok({
      materials: rows,
      movements,
      users,
      movementPagination: {
        page,
        pageSize,
        total: movementTotal,
        totalPages: Math.max(1, Math.ceil(movementTotal / pageSize)),
        search: historySearch,
      },
      canIssue: stepAllowedWithMap(workflow, "issue", user),
      canEditLocation: stepAllowedWithMap(workflow, "manage", user),
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const workflow = await getWorkflowRoleMap();
    if (!stepAllowedWithMap(workflow, "manage", user)) {
      return fail("Bạn không có quyền cập nhật vị trí lưu vật tư", 403);
    }
    const body = await req.json();
    const materialId = String(body.materialId || "").trim();
    const location = String(body.location || "").trim();
    if (!materialId) return fail("Vui lòng chọn vật tư");
    if (!location) return fail("Vui lòng nhập vị trí lưu vật tư");
    if (location.length > 200) return fail("Vị trí lưu vật tư không được vượt quá 200 ký tự");
    const material = await prisma.material.findUnique({ where: { id: materialId }, select: { id: true, code: true, name: true, category: true, location: true } });
    if (!material || !isOtherMaterialCategory(material.category)) return fail("Không tìm thấy vật tư trong nhóm Vật tư khác", 404);
    const updated = await prisma.material.update({ where: { id: material.id }, data: { location }, select: { id: true, location: true } });
    await audit(user.id, "OTHER_MATERIAL_LOCATION", "Material", material.id, `${material.code} · ${material.name}: ${material.location || "Chưa cập nhật"} → ${location}`);
    return ok(updated);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const workflow = await getWorkflowRoleMap();
    const body = await req.json();
    const type = body.type === "ISSUE" ? "ISSUE" : body.type === "USE" ? "USE" : null;
    if (!type) return fail("Nghiệp vụ tồn kho không hợp lệ");
    if (type === "ISSUE" && !stepAllowedWithMap(workflow, "issue", user)) {
      return fail("Bạn không có quyền cấp vật tư", 403);
    }
    const materialId = String(body.materialId || "").trim();
    const quantity = Math.trunc(Number(body.quantity));
    if (!materialId) return fail("Vui lòng chọn vật tư");
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Số lượng phải lớn hơn 0");
    const note = String(body.note || "").trim();
    if (!note) return fail(type === "ISSUE" ? "Vui lòng nhập mục đích cấp vật tư" : "Vui lòng nhập ghi chú sử dụng");
    const occurredAt = body.occurredAt ? parseDateInput(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return fail(type === "ISSUE" ? "Ngày cấp không hợp lệ" : "Ngày sử dụng không hợp lệ");

    const material = await prisma.material.findUnique({ where: { id: materialId }, include: MATERIAL_INCLUDE });
    if (!material || !isOtherMaterialCategory(material.category)) return fail("Không tìm thấy vật tư trong nhóm Vật tư khác", 404);
    const hasManagedScope = material.replacements.some((row) => Boolean(row.managingPosition?.trim() || row.deviceSeq));

    let assignedPosition: string | null = null;
    let deviceSeq: string | null = null;
    let receiver: { id?: string | null; name: string } | null = null;
    if (type === "ISSUE") {
      if (hasManagedScope) return fail("Vật tư có cương vị phải ghi nhận Sử dụng, không thực hiện Cấp phát");
      const receiverId = String(body.receiverId || "").trim();
      if (!receiverId) return fail("Vui lòng chọn người lấy vật tư");
      const receiverUser = await prisma.user.findFirst({ where: { id: receiverId, isActive: true }, select: { id: true, name: true } });
      if (!receiverUser) return fail("Không tìm thấy người lấy vật tư", 404);
      receiver = { id: receiverUser.id, name: receiverUser.name };
      assignedPosition = COMMON_MATERIAL_POSITION;
    } else {
      assignedPosition = String(body.assignedPosition || "").trim() || null;
      if (!hasManagedScope || !assignedPosition) return fail("Vui lòng chọn cương vị sử dụng vật tư");
      const matchingRows = material.replacements.filter((row) => positionsMatch(row.managingPosition, assignedPosition));
      if (!matchingRows.length) return fail("Vật tư không thuộc cương vị đã chọn");
      const canUseByAssignedPosition = positionsMatch(user.position, assignedPosition);
      if (!canUseByAssignedPosition && !stepAllowedWithMap(workflow, "use", user)) {
        return fail("Bạn không có quyền ghi nhận sử dụng vật tư cho cương vị này", 403);
      }
      const deviceRows = matchingRows.filter((row) => row.deviceSeq);
      deviceSeq = String(body.deviceSeq || "").trim() || null;
      if (deviceRows.length && !deviceSeq) return fail("Vui lòng chọn thiết bị sử dụng vật tư");
      if (deviceSeq && !deviceRows.some((row) => row.deviceSeq === deviceSeq)) return fail("Thiết bị không thuộc vật tư và cương vị đã chọn");
    }

    const movement = await prisma.$transaction(async (tx) => consumeOtherMaterial(tx, {
      material: { id: material.id, code: material.code, erpCodes: material.erpCodes, quantity: material.quantity },
      type,
      quantity,
      occurredAt,
      assignedPosition,
      unit: material.machine,
      deviceSeq,
      receiver,
      actor: user,
      note,
    }));
    await audit(user.id, type === "ISSUE" ? "OTHER_MATERIAL_ISSUE" : "OTHER_MATERIAL_USE", "MaterialStockMovement", movement.id,
      `${material.code} · ${material.name}: ${type === "ISSUE" ? "cấp" : "sử dụng"} ${quantity} ${material.unit}; tồn ${movement.stockBefore} → ${movement.stockAfter}`);
    return ok(movement);
  });
}
