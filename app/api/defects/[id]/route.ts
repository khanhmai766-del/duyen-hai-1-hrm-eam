import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import {
  ensureDefectImpactColumns,
  normalizeImpactValue,
  readDefectImpactFields,
  updateDefectImpactFields,
} from "@/lib/defect-impact-fields";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true } } };

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();
    await ensureDefectImpactColumns(prisma);
    const defect = await prisma.defect.update({
      where: { id: params.id },
      data: {
        unit: body.unit,
        device: body.device !== undefined ? body.device || null : undefined,
        system: body.system !== undefined ? body.system || null : undefined,
        severity: body.severity !== undefined ? body.severity || null : undefined,
        condition: body.condition !== undefined ? body.condition || null : undefined,
        requestType: body.requestType !== undefined ? body.requestType || null : undefined,
        requestNumber: body.requestNumber !== undefined ? body.requestNumber?.trim() || null : undefined,
        content: body.content !== undefined ? body.content?.trim() || null : undefined,
        status: body.status,
        detectedAt: body.detectedAt !== undefined ? (body.detectedAt ? new Date(body.detectedAt) : null) : undefined,
        note: body.note !== undefined ? body.note?.trim() || null : undefined,
      },
      include: INCLUDE,
    });
    if (body.fireSafetyImpact !== undefined || body.environmentSafetyImpact !== undefined) {
      await updateDefectImpactFields(prisma, defect.id, {
        fireSafetyImpact: normalizeImpactValue(body.fireSafetyImpact),
        environmentSafetyImpact: normalizeImpactValue(body.environmentSafetyImpact),
      });
    }
    const impactFields = await readDefectImpactFields(prisma, [defect.id]);
    await audit(user.id, "UPDATE_DEFECT", "Defect", defect.id);
    return ok({ ...defect, ...impactFields.get(defect.id) });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR"]);
    await prisma.defect.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEFECT", "Defect", params.id);
    return ok({ id: params.id });
  });
}
