import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  managingPositionsForEquipmentSeq,
  resolveEquipmentAccessForUser,
} from "@/lib/server-access";
import { getCachedEquipmentNodeFull } from "@/lib/equipment-node-cache";
import { assertSeqsInScope } from "@/lib/equipment-tree-scope";
import { replacementDueStatus } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { positionCodeOf, positionsMatch } from "@/lib/position-catalog";
import {
  canEditMaterialReplacement,
  canViewMaterialReplacement,
} from "@/lib/material-replacement-access";

export const dynamic = "force-dynamic";

const INCLUDE = {
  material: {
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      imageUrl: true,
      system: true,
      machine: true,
      category: true,
      deviceMaterials: {
        select: { id: true, deviceSeq: true, materialId: true, quantity: true, usedAt: true, note: true, device: { select: EQUIPMENT_DEVICE_SELECT } },
        orderBy: { usedAt: "desc" },
      },
    },
  },
  device: { select: EQUIPMENT_DEVICE_SELECT },
  _count: { select: { logs: true } },
} satisfies Prisma.MaterialReplacementInclude;

function mapPoint(point: any) {
  return {
    ...point,
    deviceId: point.deviceSeq ?? null,
    device: equipmentNodeToDevice(point.device),
    material: point.material
      ? {
          ...point.material,
          deviceMaterials: point.material.deviceMaterials?.map((dm: any) => ({
            ...dm,
            deviceId: dm.deviceSeq,
            device: equipmentNodeToDevice(dm.device),
          })),
        }
      : point.material,
  };
}
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const materialId = sp.get("materialId");
    const due = sp.get("due");

    // Chu kỳ 0 chỉ dùng để khai báo liên kết vật tư - thiết bị, không xuất hiện
    // trong lịch hoặc cảnh báo thay thế.
    const where: Prisma.MaterialReplacementWhereInput = { isActive: true, intervalMonths: { gt: 0 } };
    if (materialId) where.materialId = materialId;
    if (q) {
      where.OR = [
        { material: { is: { name: { contains: q, mode: "insensitive" } } } },
        { material: { is: { code: { contains: q, mode: "insensitive" } } } },
        { material: { is: { deviceMaterials: { some: { device: { is: { seq: { contains: q, mode: "insensitive" } } } } } } } },
        { material: { is: { deviceMaterials: { some: { device: { is: { name: { contains: q, mode: "insensitive" } } } } } } } },
        { device: { is: { seq: { contains: q, mode: "insensitive" } } } },
        { device: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const points = await prisma.materialReplacement.findMany({
      where,
      orderBy: { nextDueAt: "asc" },
      include: INCLUDE,
    });
    const visiblePoints = points.filter((point) => canViewMaterialReplacement(access, point));

    const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
    for (const p of visiblePoints) counts[replacementDueStatus(p.nextDueAt)]++;

    let filtered = visiblePoints;
    if (due && due !== "ALL") {
      if (due === "WARN") filtered = visiblePoints.filter((p) => replacementDueStatus(p.nextDueAt) !== "OK");
      else filtered = visiblePoints.filter((p) => replacementDueStatus(p.nextDueAt) === due);
    }

    return ok(filtered.map(mapPoint), { total: filtered.length, counts, warn: counts.OVERDUE + counts.DUE_SOON });
  });
}

// POST /api/material-replacements — tạo MỘT ĐIỂM THEO DÕI thời gian thay thế (isActive=true).
// Số điểm đang hoạt động của cùng vật tư + thiết bị không được vượt quá deviceCount
// trên dòng khai báo (isActive=false, chưa có lịch sử). Khi điểm bị xoá hoặc được
// ghi nhận vào lịch sử (isActive=false), lượt tương ứng được giải phóng.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["personal", "manage", "full"], "Không đủ quyền thêm điểm theo dõi");
    const body = await req.json();

    const materialId = String(body.materialId || "").trim();
    const material = await prisma.material.findUnique({ where: { id: materialId }, select: { id: true, code: true, machine: true } });
    if (!material) return fail("Không tìm thấy vật tư", 404);

    const deviceSeq = String(body.deviceSeq ?? body.deviceId ?? "").trim() || null;
    const system = String(body.system ?? "").trim() || null;
    const location = String(body.location ?? "").trim() || null;
    if (!deviceSeq && !system) return fail("Điểm theo dõi phải gắn với thiết bị hoặc hệ thống");
    // Tổ máy của điểm theo dõi bám theo tổ máy của vật tư, và chỉ được gắn thiết bị trong
    // đúng cây của tổ máy đó (S1/S2 → nhánh 1,2,3,7; COMMON → 5,6).
    assertSeqsInScope([deviceSeq], material.machine);

    const access = await resolveEquipmentAccessForUser(user);
    if (!canEditMaterialReplacement(access, { deviceSeq, system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên hệ thống/thiết bị này", 403);
    }
    let managingPosition = String(body.managingPosition ?? "").trim() || null;
    if (deviceSeq) {
      const nodes = await getCachedEquipmentNodeFull();
      const positions = await managingPositionsForEquipmentSeq(deviceSeq, nodes);
      if (!positions.length) {
        return fail("Thiết bị chưa được phân cương vị quản lý trên cây thiết bị");
      }
      if (managingPosition) {
        const matched = positions.find((position) => positionsMatch(position, managingPosition));
        if (!matched) {
          return fail("Cương vị không còn được phân quyền quản lý thiết bị đã chọn");
        }
        managingPosition = matched;
      } else {
        managingPosition = positions[0];
      }
    }

    const parsedInterval = Math.round(Number(body.intervalMonths));
    const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 12;
    const lastReplacedAt = body.lastReplacedAt ? parseDateInput(body.lastReplacedAt) : new Date();
    let nextDueAt: Date;
    if (body.nextDueAt) {
      nextDueAt = parseDateInput(body.nextDueAt);
    } else {
      nextDueAt = new Date(lastReplacedAt);
      nextDueAt.setMonth(nextDueAt.getMonth() + intervalMonths);
    }

    if (intervalMonths === 0) return fail("Chu kỳ 0 không theo dõi lịch thay thế");

    const targetWhere: Prisma.MaterialReplacementWhereInput = deviceSeq
      ? { materialId, deviceSeq }
      : { materialId, deviceSeq: null, system, location };
    const targetLockKey = deviceSeq
      ? `${materialId}|device:${deviceSeq}`
      : `${materialId}|system:${normalizeText(system ?? "")}|location:${normalizeText(location ?? "")}`;

    const point = await prisma.$transaction(async (tx) => {
      // Khoá tuần tự theo đúng vật tư + thiết bị để hai yêu cầu đồng thời không thể
      // cùng đọc một lượt trống rồi tạo vượt quá số lượng thiết bị đã khai báo.
      // pg_advisory_xact_lock trả về PostgreSQL void; ép sang text để Prisma không
      // lỗi P2010 khi giải mã kết quả của $queryRaw.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${targetLockKey}))::text AS lock_result
      `;

      const declaration = await tx.materialReplacement.findFirst({
        where: {
          ...targetWhere,
          isActive: false,
          logs: { none: {} },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, deviceCount: true },
      });
      if (!declaration) {
        throw fail(
          "Không tìm thấy dòng khai báo thiết bị tương ứng trong Danh mục vật tư. Vui lòng cập nhật danh mục trước khi thêm điểm theo dõi.",
          400
        );
      }

      const limit = Math.max(1, declaration.deviceCount);
      const activeCount = await tx.materialReplacement.count({
        where: { ...targetWhere, isActive: true },
      });
      if (activeCount >= limit) {
        throw fail(
          limit === 1
            ? "Thiết bị này đã có điểm theo dõi. Chỉ được thêm lại sau khi điểm hiện tại bị xoá hoặc được ghi nhận vào lịch sử thay thế."
            : `Đã đủ ${activeCount}/${limit} điểm theo dõi theo số lượng thiết bị đã khai báo.`,
          409
        );
      }

      return tx.materialReplacement.create({
        data: {
          materialId,
          deviceSeq,
          machine: material.machine,
          system,
          location,
          managingPosition,
          managingPositionCode: positionCodeOf(managingPosition),
          quantity: Math.max(0, Math.round(Number(body.quantity)) || 0),
          // Điểm theo dõi kế thừa giới hạn từ dòng khai báo, không tin giá trị client gửi lên.
          deviceCount: limit,
          intervalMonths,
          intervalNote: String(body.intervalNote ?? "").trim() || null,
          lastReplacedAt,
          nextDueAt,
          note: String(body.note ?? "").trim() || null,
          isActive: true,
          createdById: user.id,
        },
        include: INCLUDE,
      });
    });
    await audit(user.id, "CREATE_REPLACEMENT", "MaterialReplacement", point.id, auditDetailWithPosition(user, material.code));
    return ok(mapPoint(point));
  });
}
