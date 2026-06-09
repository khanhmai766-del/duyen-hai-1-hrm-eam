import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { addMonths, replacementDueStatus } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

const INCLUDE = {
  material: { select: { id: true, code: true, name: true, unit: true, imageUrl: true, system: true } },
  device: { select: { id: true, code: true, name: true, location: true } },
  _count: { select: { logs: true } },
} satisfies Prisma.MaterialReplacementInclude;

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const materialId = sp.get("materialId");
    const due = sp.get("due"); // OVERDUE | DUE_SOON | OK | WARN(=OVERDUE+DUE_SOON) | ALL

    const where: Prisma.MaterialReplacementWhereInput = { isActive: true };
    if (materialId) where.materialId = materialId;
    if (q) {
      where.OR = [
        { location: { contains: q, mode: "insensitive" } },
        { material: { is: { name: { contains: q, mode: "insensitive" } } } },
        { material: { is: { code: { contains: q, mode: "insensitive" } } } },
        { device: { is: { code: { contains: q, mode: "insensitive" } } } },
        { device: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const points = await prisma.materialReplacement.findMany({
      where,
      orderBy: { nextDueAt: "asc" },
      include: INCLUDE,
    });

    const counts = { OVERDUE: 0, DUE_SOON: 0, OK: 0 };
    for (const p of points) counts[replacementDueStatus(p.nextDueAt)]++;

    let filtered = points;
    if (due && due !== "ALL") {
      if (due === "WARN") filtered = points.filter((p) => replacementDueStatus(p.nextDueAt) !== "OK");
      else filtered = points.filter((p) => replacementDueStatus(p.nextDueAt) === due);
    }

    return ok(filtered, { total: filtered.length, counts, warn: counts.OVERDUE + counts.DUE_SOON });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    const body = await req.json();

    if (!body.materialId || !body.intervalMonths) {
      return fail("Thiếu thông tin bắt buộc (vật tư, chu kỳ)");
    }
    if (!body.deviceId && !body.location?.trim()) {
      return fail("Chọn thiết bị hoặc nhập vị trí thay thế");
    }
    const intervalMonths = Number(body.intervalMonths);
    if (!Number.isFinite(intervalMonths) || intervalMonths < 1) {
      return fail("Chu kỳ phải là số tháng hợp lệ (≥ 1)");
    }

    const material = await prisma.material.findUnique({ where: { id: body.materialId } });
    if (!material) return fail("Không tìm thấy vật tư", 404);

    // nextDue: dùng giá trị nhập, nếu trống thì tính từ lần thay gần nhất (hoặc hôm nay) + chu kỳ.
    const base = body.lastReplacedAt ? new Date(body.lastReplacedAt) : new Date();
    const nextDueAt = body.nextDueAt ? new Date(body.nextDueAt) : addMonths(base, intervalMonths);

    const point = await prisma.materialReplacement.create({
      data: {
        materialId: body.materialId,
        deviceId: body.deviceId || null,
        location: body.location?.trim() || null,
        system: body.system?.trim() || material.system || null,
        intervalMonths,
        intervalNote: body.intervalNote?.trim() || null,
        lastReplacedAt: body.lastReplacedAt ? new Date(body.lastReplacedAt) : null,
        nextDueAt,
        note: body.note?.trim() || null,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_REPLACEMENT", "MaterialReplacement", point.id, material.code);
    return ok(point);
  });
}
