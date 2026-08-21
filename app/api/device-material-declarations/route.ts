import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  assertSeqEditable,
  managingPositionsForEquipmentSeq,
  resolveEquipmentAccessForUser,
} from "@/lib/server-access";
import { assertSeqsInScope } from "@/lib/equipment-tree-scope";
import { getCachedEquipmentNodeFull } from "@/lib/equipment-node-cache";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { DEFECT_UNITS, MATERIAL_CATEGORIES, addMonths } from "@/lib/constants";
import { parseDateInput } from "@/lib/utils";
import { positionCodeOf, positionsMatch } from "@/lib/position-catalog";
import { canEditMaterialReplacement } from "@/lib/material-replacement-access";

export const dynamic = "force-dynamic";

function parseMachine(value: unknown) {
  const machine = String(value ?? "").trim().toUpperCase();
  return (DEFECT_UNITS as readonly string[]).includes(machine) ? machine : null;
}

function parseMachines(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(values.map(parseMachine).filter((item): item is string => Boolean(item))));
}

/** Danh sách vật tư trong Danh mục PXVH1 để khai báo cho một thiết bị. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["personal", "manage", "full"], "Không đủ quyền khai báo vật tư thiết bị");

    const deviceSeq = req.nextUrl.searchParams.get("deviceSeq")?.trim();
    const machines = parseMachines(
      req.nextUrl.searchParams.get("machines") ?? req.nextUrl.searchParams.get("machine")
    );
    if (!deviceSeq) return fail("Thiếu mã thiết bị");
    if (!machines.length) return fail("Tổ máy không hợp lệ");
    if (machines.includes("COMMON") && machines.length > 1) return fail("Thiết bị dùng chung không thể khai báo cùng tổ máy khác");
    await assertSeqEditable(user, deviceSeq);

    const materials = await prisma.material.findMany({
      where: { machine: { in: machines } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, unit: true, category: true, machine: true, quantity: true },
    });

    const byCode = new Map<string, typeof materials>();
    for (const material of materials) byCode.set(material.code, [...(byCode.get(material.code) ?? []), material]);
    const options = Array.from(byCode.values()).flatMap((siblings) => {
      if (!machines.every((machine) => siblings.some((material) => material.machine === machine))) return [];
      const primary = siblings.find((material) => material.machine === machines[0]) ?? siblings[0];
      return [{
        ...primary,
        materialIdsByMachine: Object.fromEntries(siblings.map((material) => [material.machine, material.id])),
        machines,
      }];
    });

    return ok(options, {
      categories: MATERIAL_CATEGORIES.filter((category) => options.some((material) => material.category === category)),
      total: options.length,
    });
  });
}

/** Tạo một dòng "Vật tư được khai báo" cho thiết bị, chưa kích hoạt lịch thay thế. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["personal", "manage", "full"], "Không đủ quyền khai báo vật tư thiết bị");
    const body = await req.json();

    const deviceSeq = String(body.deviceSeq ?? "").trim();
    const materialId = String(body.materialId ?? "").trim();
    const machines = parseMachines(body.machines ?? body.machine);
    if (!deviceSeq) return fail("Thiếu mã thiết bị");
    if (!materialId) return fail("Vui lòng chọn vật tư");
    if (!machines.length) return fail("Tổ máy không hợp lệ");
    if (machines.includes("COMMON") && machines.length > 1) return fail("Thiết bị dùng chung không thể khai báo cùng tổ máy khác");
    await assertSeqEditable(user, deviceSeq);

    const materialIdsByMachine = body.materialIdsByMachine && typeof body.materialIdsByMachine === "object"
      ? body.materialIdsByMachine as Record<string, unknown>
      : {};
    const requestedIds = machines.map((machine) =>
      String(materialIdsByMachine[machine] ?? (machines.length === 1 ? materialId : "")).trim()
    );
    if (requestedIds.some((id) => !id)) return fail("Vật tư chưa có đủ danh mục cho các tổ máy đã chọn");

    const [device, materials] = await Promise.all([
      prisma.equipmentNode.findUnique({ where: { seq: deviceSeq }, select: { seq: true, name: true, parentSeq: true } }),
      prisma.material.findMany({
        where: { id: { in: requestedIds }, machine: { in: machines } },
        select: { id: true, code: true, name: true, unit: true, category: true, machine: true },
      }),
    ]);
    if (!device) return fail("Không tìm thấy thiết bị", 404);
    if (materials.length !== machines.length) return fail("Vật tư không tồn tại đầy đủ trong danh mục của các tổ máy đã chọn", 404);
    if (new Set(materials.map((material) => material.code)).size !== 1) return fail("Vật tư được chọn không đồng nhất giữa các tổ máy");
    const materialByMachine = new Map(materials.map((material) => [material.machine, material]));
    if (machines.some((machine) => materialByMachine.get(machine)?.id !== String(materialIdsByMachine[machine] ?? (machines.length === 1 ? materialId : "")))) {
      return fail("Vật tư không khớp tổ máy đã chọn");
    }
    // Tổ máy quyết định CÂY thiết bị được phép khai báo (S1/S2 → nhánh 1,2,3,7; COMMON → 5,6).
    for (const machine of machines) assertSeqsInScope([deviceSeq], machine);

    const duplicates = await prisma.materialReplacement.findMany({
      where: { materialId: { in: requestedIds }, deviceSeq, machine: { in: machines }, isActive: false },
      select: { machine: true },
    });
    if (duplicates.length) return fail(`Vật tư này đã được khai báo cho thiết bị tại ${duplicates.map((item) => item.machine).join(", ")}`);

    const parsedInterval = Math.round(Number(body.intervalMonths));
    const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 0;
    const lastReplacedAt = body.lastReplacedAt ? parseDateInput(body.lastReplacedAt) : null;
    if (lastReplacedAt && Number.isNaN(lastReplacedAt.getTime())) {
      return fail("Lần thay gần nhất không phải ngày hợp lệ");
    }
    if (lastReplacedAt) {
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (lastReplacedAt >= tomorrow) {
        return fail("Lần thay gần nhất không được là ngày trong tương lai");
      }
      if (intervalMonths <= 0) {
        return fail("Đã nhập Lần thay gần nhất thì Chu kỳ thay thế phải lớn hơn 0 tháng để lên lịch theo dõi");
      }
    }

    const managingPosition = String(body.managingPosition ?? "").trim() || null;
    const declarationData = {
      system: String(body.system ?? "").trim() || null,
      location: String(body.location ?? "").trim() || device.name,
      managingPosition,
      managingPositionCode: positionCodeOf(managingPosition),
      quantity: Math.max(0, Math.round(Number(body.quantity)) || 0),
      deviceCount: Math.max(1, Math.round(Number(body.deviceCount)) || 1),
      intervalMonths,
      intervalNote: String(body.intervalNote ?? "").trim() || null,
      note: String(body.note ?? "").trim() || null,
      recoveryOnSupplement: body.recoveryOnSupplement === true,
    };

    const points = await prisma.$transaction(async (tx) => {
      const declarations: Array<{ id: string }> = [];
      for (const machine of machines) {
        const material = materialByMachine.get(machine)!;
        // Dòng khai báo luôn được giữ riêng để tiếp tục hiển thị tại Chi tiết điểm thay thế.
        const declaration = await tx.materialReplacement.create({
          data: {
            ...declarationData,
            machine,
            materialId: material.id,
            deviceSeq,
            lastReplacedAt: null,
            nextDueAt: addMonths(new Date(), intervalMonths),
            isActive: false,
            createdById: user.id,
          },
          select: { id: true },
        });

        // Có ngày thay gần nhất: tạo/cập nhật đúng một điểm theo dõi tương ứng.
        // Lịch thay thế và sidebar đều đọc dòng isActive=true này.
        if (lastReplacedAt) {
          const trackingData = {
            ...declarationData,
            machine,
            lastReplacedAt,
            nextDueAt: addMonths(lastReplacedAt, intervalMonths),
            isActive: true,
          };
          const existingTracking = await tx.materialReplacement.findFirst({
            where: { materialId: material.id, deviceSeq, machine, isActive: true },
            select: { id: true },
          });
          if (existingTracking) {
            await tx.materialReplacement.update({
              where: { id: existingTracking.id },
              data: trackingData,
            });
          } else {
            await tx.materialReplacement.create({
              data: {
                ...trackingData,
                materialId: material.id,
                deviceSeq,
                createdById: user.id,
              },
            });
          }
        }
        declarations.push(declaration);
      }
      return declarations;
    });

    await audit(
      user.id,
      "DECLARE_DEVICE_MATERIAL",
      "MaterialReplacement",
      points.map((point) => point.id).join(","),
      auditDetailWithPosition(
        user,
        `${deviceSeq} · ${materials[0].code} · ${machines.join(" + ")}${lastReplacedAt ? " · đồng bộ lịch thay thế" : ""}`
      )
    );
    return ok(points);
  });
}

/**
 * Cập nhật đồng thời một khai báo vật tư cho S1 và S2.
 *
 * Hai tổ máy dùng chung node thiết bị nhưng có Material/MaterialReplacement riêng.
 * Toàn bộ thao tác chạy trong một transaction để không tạo trạng thái lệch giữa S1 và S2.
 */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "replacement-manage",
      ["manage", "full"],
      "Không đủ quyền cập nhật vật tư khai báo"
    );

    const body = await req.json();
    const sourceId = String(body.id ?? "").trim();
    const deviceSeq = String(body.deviceSeq ?? "").trim();
    const machines = parseMachines(body.machines);
    if (!sourceId) return fail("Thiếu khai báo vật tư cần cập nhật");
    if (!deviceSeq) return fail("Thiếu mã thiết bị");
    if (machines.length !== 2 || !machines.includes("S1") || !machines.includes("S2")) {
      return fail("Cập nhật đồng thời chỉ áp dụng cho cả S1 và S2");
    }
    await assertSeqEditable(user, deviceSeq);
    for (const machine of machines) assertSeqsInScope([deviceSeq], machine);

    const source = await prisma.materialReplacement.findUnique({
      where: { id: sourceId },
      include: {
        material: { select: { code: true } },
        _count: { select: { logs: true, defectRequests: true } },
      },
    });
    if (!source || source.isActive) return fail("Không tìm thấy khai báo vật tư", 404);
    if (source.deviceSeq !== deviceSeq || !machines.includes(source.machine)) {
      return fail("Khai báo vật tư không thuộc thiết bị hoặc tổ máy đã chọn", 400);
    }

    const access = await resolveEquipmentAccessForUser(user);
    if (!canEditMaterialReplacement(access, source)) {
      return fail("Cương vị của bạn không có quyền cập nhật khai báo vật tư này", 403);
    }

    const materialIdsByMachine = body.materialIdsByMachine && typeof body.materialIdsByMachine === "object"
      ? body.materialIdsByMachine as Record<string, unknown>
      : {};
    const requestedIds = machines.map((machine) => String(materialIdsByMachine[machine] ?? "").trim());
    if (requestedIds.some((id) => !id)) {
      return fail("Vật tư chưa có đủ danh mục cho cả S1 và S2");
    }
    const materials = await prisma.material.findMany({
      where: { id: { in: requestedIds }, machine: { in: machines } },
      select: { id: true, code: true, machine: true },
    });
    if (materials.length !== 2 || new Set(materials.map((material) => material.code)).size !== 1) {
      return fail("Vật tư được chọn không đồng nhất giữa S1 và S2");
    }
    const materialByMachine = new Map(materials.map((material) => [material.machine, material]));
    if (machines.some((machine) => materialByMachine.get(machine)?.id !== String(materialIdsByMachine[machine] ?? ""))) {
      return fail("Vật tư không khớp tổ máy đã chọn");
    }

    const quantity = Math.round(Number(body.quantity));
    const deviceCount = Math.round(Number(body.deviceCount));
    const intervalMonths = Math.round(Number(body.intervalMonths));
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Dung tích hoặc số lượng phải lớn hơn 0");
    if (!Number.isFinite(deviceCount) || deviceCount <= 0) return fail("Số lượng thiết bị phải lớn hơn 0");
    if (!Number.isFinite(intervalMonths) || intervalMonths < 0) {
      return fail("Chu kỳ phải là số tháng hợp lệ (>= 0; 0 = không theo dõi lịch)");
    }

    const nodes = await getCachedEquipmentNodeFull();
    const allowedPositions = await managingPositionsForEquipmentSeq(deviceSeq, nodes);
    if (!allowedPositions.length) {
      return fail("Thiết bị chưa được phân cương vị quản lý trên cây thiết bị");
    }
    const requestedPosition = String(body.managingPosition ?? "").trim() || null;
    const managingPosition = requestedPosition
      ? allowedPositions.find((position) => positionsMatch(position, requestedPosition))
      : allowedPositions[0];
    if (!managingPosition) {
      return fail("Cương vị không còn được phân quyền quản lý thiết bị đã chọn");
    }

    const siblingRows = await prisma.materialReplacement.findMany({
      where: {
        deviceSeq,
        machine: { in: machines },
        isActive: false,
        material: { code: source.material.code },
      },
      include: { _count: { select: { logs: true, defectRequests: true } } },
    });
    const siblingByMachine = new Map(siblingRows.map((point) => [point.machine, point]));
    siblingByMachine.set(source.machine, source);
    for (const point of siblingByMachine.values()) {
      if (!canEditMaterialReplacement(access, point)) {
        return fail(`Cương vị của bạn không có quyền cập nhật khai báo tại ${point.machine}`, 403);
      }
    }

    const commonData = {
      system: String(body.system ?? "").trim() || null,
      location: String(body.location ?? "").trim() || null,
      managingPosition,
      managingPositionCode: positionCodeOf(managingPosition),
      quantity,
      deviceCount,
      intervalMonths,
      intervalNote: String(body.intervalNote ?? "").trim() || null,
      note: String(body.note ?? "").trim() || null,
      recoveryOnSupplement: body.recoveryOnSupplement === true,
    };

    const points = await prisma.$transaction(async (tx) => {
      const saved: Array<{ id: string; machine: string }> = [];
      for (const machine of machines) {
        const targetMaterial = materialByMachine.get(machine)!;
        const current = siblingByMachine.get(machine);
        if (current && current.materialId !== targetMaterial.id) {
          if (current._count.logs > 0 || current._count.defectRequests > 0) {
            throw fail(`Không thể đổi vật tư tại ${machine} vì khai báo đã phát sinh yêu cầu hoặc lịch sử thay thế`);
          }
          const [duplicate, activeTracking] = await Promise.all([
            tx.materialReplacement.findFirst({
              where: { id: { not: current.id }, materialId: targetMaterial.id, deviceSeq, machine, isActive: false },
              select: { id: true },
            }),
            tx.materialReplacement.findFirst({
              where: { materialId: current.materialId, deviceSeq, machine, isActive: true },
              select: { id: true },
            }),
          ]);
          if (duplicate) throw fail(`Vật tư mới đã được khai báo cho thiết bị tại ${machine}`);
          if (activeTracking) {
            throw fail(`Khai báo tại ${machine} đang có điểm theo dõi; hãy kết thúc hoặc gỡ điểm theo dõi trước khi đổi vật tư`);
          }
        }

        const point = current
          ? await tx.materialReplacement.update({
              where: { id: current.id },
              data: { ...commonData, materialId: targetMaterial.id },
              select: { id: true, machine: true },
            })
          : await tx.materialReplacement.create({
              data: {
                ...commonData,
                materialId: targetMaterial.id,
                deviceSeq,
                machine,
                lastReplacedAt: null,
                nextDueAt: addMonths(new Date(), intervalMonths),
                isActive: false,
                createdById: user.id,
              },
              select: { id: true, machine: true },
            });

        const linked = await tx.equipmentMaterial.findFirst({
          where: { materialId: targetMaterial.id, deviceSeq },
          select: { id: true },
        });
        if (!linked) {
          await tx.equipmentMaterial.create({ data: { materialId: targetMaterial.id, deviceSeq, quantity: 1 } });
        }
        saved.push(point);
      }
      return saved;
    });

    await audit(
      user.id,
      "UPDATE_DEVICE_MATERIAL_BOTH_UNITS",
      "MaterialReplacement",
      points.map((point) => point.id).join(","),
      auditDetailWithPosition(user, `${deviceSeq} · ${materials[0].code} · S1 + S2`)
    );
    return ok(points);
  });
}
