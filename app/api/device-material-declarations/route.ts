import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { assertSeqEditable } from "@/lib/server-access";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { DEFECT_UNITS, MATERIAL_CATEGORIES, addMonths } from "@/lib/constants";
import { parseDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parseMachine(value: unknown) {
  const machine = String(value ?? "").trim().toUpperCase();
  return (DEFECT_UNITS as readonly string[]).includes(machine) ? machine : null;
}

/** Danh sách vật tư trong Danh mục PXVH1 để khai báo cho một thiết bị. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["create", "manage", "full"], "Không đủ quyền khai báo vật tư thiết bị");

    const deviceSeq = req.nextUrl.searchParams.get("deviceSeq")?.trim();
    const machine = parseMachine(req.nextUrl.searchParams.get("machine"));
    if (!deviceSeq) return fail("Thiếu mã thiết bị");
    if (!machine) return fail("Tổ máy không hợp lệ");
    await assertSeqEditable(user, deviceSeq);

    const materials = await prisma.material.findMany({
      where: { machine },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, unit: true, category: true, machine: true, quantity: true },
    });

    return ok(materials, {
      categories: MATERIAL_CATEGORIES.filter((category) => materials.some((material) => material.category === category)),
      total: materials.length,
    });
  });
}

/** Tạo một dòng "Vật tư được khai báo" cho thiết bị, chưa kích hoạt lịch thay thế. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["create", "manage", "full"], "Không đủ quyền khai báo vật tư thiết bị");
    const body = await req.json();

    const deviceSeq = String(body.deviceSeq ?? "").trim();
    const materialId = String(body.materialId ?? "").trim();
    const machine = parseMachine(body.machine);
    if (!deviceSeq) return fail("Thiếu mã thiết bị");
    if (!materialId) return fail("Vui lòng chọn vật tư");
    if (!machine) return fail("Tổ máy không hợp lệ");
    await assertSeqEditable(user, deviceSeq);

    const [device, material] = await Promise.all([
      prisma.equipmentNode.findUnique({ where: { seq: deviceSeq }, select: { seq: true, name: true, parentSeq: true } }),
      prisma.material.findFirst({
        where: { id: materialId, machine },
        select: { id: true, code: true, name: true, unit: true, category: true, machine: true },
      }),
    ]);
    if (!device) return fail("Không tìm thấy thiết bị", 404);
    if (!material) return fail("Vật tư không tồn tại trong danh mục của tổ máy đã chọn", 404);

    const duplicate = await prisma.materialReplacement.findFirst({
      where: { materialId, deviceSeq, machine, isActive: false },
      select: { id: true },
    });
    if (duplicate) return fail("Vật tư này đã được khai báo cho thiết bị và tổ máy đã chọn");

    const parsedInterval = Math.round(Number(body.intervalMonths));
    const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 0;
    const lastReplacedAt = body.lastReplacedAt ? parseDateInput(body.lastReplacedAt) : null;
    const nextDueAt = addMonths(lastReplacedAt ?? new Date(), intervalMonths);
    const point = await prisma.materialReplacement.create({
      data: {
        materialId,
        deviceSeq,
        machine,
        system: String(body.system ?? "").trim() || null,
        location: String(body.location ?? "").trim() || device.name,
        managingPosition: String(body.managingPosition ?? "").trim() || null,
        quantity: Math.max(0, Math.round(Number(body.quantity)) || 0),
        deviceCount: Math.max(1, Math.round(Number(body.deviceCount)) || 1),
        intervalMonths,
        intervalNote: String(body.intervalNote ?? "").trim() || null,
        lastReplacedAt,
        nextDueAt,
        note: String(body.note ?? "").trim() || null,
        isActive: false,
        createdById: user.id,
      },
      include: { material: { select: { id: true, name: true, unit: true, machine: true, category: true } } },
    });

    await audit(user.id, "DECLARE_DEVICE_MATERIAL", "MaterialReplacement", point.id, `${deviceSeq} · ${material.code}`);
    return ok(point);
  });
}
