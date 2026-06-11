import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true } } };

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const system = searchParams.get("system");
    const unit = searchParams.get("unit");
    const workOrderNumber = searchParams.get("workOrderNumber");
    const device = searchParams.get("device");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (system) where.system = system;
    if (unit) where.unit = unit;
    if (workOrderNumber) where.workOrderNumber = { contains: workOrderNumber, mode: "insensitive" };
    if (device) where.device = { contains: device, mode: "insensitive" };
    if (from || to) {
      where.performedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
      };
    }

    const history = await prisma.defectHistory.findMany({
      where,
      orderBy: { performedAt: "desc" },
      include: INCLUDE,
    });
    return ok(history, { total: history.length });
  });
}

/** Thêm mới một bản ghi lịch sử khiếm khuyết thủ công (không qua phiếu khiếm khuyết). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");

    const images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : [];
    const history = await prisma.defectHistory.create({
      data: {
        unit: body.unit,
        device: body.device?.trim() || null,
        system: body.system?.trim() || null,
        requestType: body.requestType?.trim() || null,
        workOrderNumber: body.workOrderNumber?.trim() || null,
        performedAt: body.performedAt ? new Date(body.performedAt) : new Date(),
        result: body.result?.trim() || null,
        content: body.content?.trim() || null,
        requestNumber: body.requestNumber?.trim() || null,
        images,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_DEFECT_HISTORY", "DefectHistory", history.id);
    return ok(history);
  });
}
