import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser, requireRole, handle, audit } from "@/lib/api";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true } } };

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();
    const images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 3) : undefined;

    const history = await prisma.defectHistory.update({
      where: { id: params.id },
      data: {
        unit: body.unit !== undefined ? body.unit : undefined,
        device: body.device !== undefined ? body.device?.trim() || null : undefined,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        workOrderNumber: body.workOrderNumber !== undefined ? body.workOrderNumber?.trim() || null : undefined,
        performedAt: body.performedAt !== undefined ? (body.performedAt ? new Date(body.performedAt) : undefined) : undefined,
        result: body.result !== undefined ? body.result?.trim() || null : undefined,
        content: body.content !== undefined ? body.content?.trim() || null : undefined,
        requestNumber: body.requestNumber !== undefined ? body.requestNumber?.trim() || null : undefined,
        images,
      },
      include: INCLUDE,
    });
    await audit(user.id, "UPDATE_DEFECT_HISTORY", "DefectHistory", history.id);
    return ok(history);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    await prisma.defectHistory.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEFECT_HISTORY", "DefectHistory", params.id);
    return ok({ id: params.id });
  });
}
