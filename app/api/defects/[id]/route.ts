import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
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
    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    if (existing.device) await assertSeqEditable(user, existing.device);
    if (body.device) await assertSeqEditable(user, String(body.device));
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
    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: existing.device, system: existing.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }
    await prisma.defect.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEFECT", "Defect", params.id);
    return ok({ id: params.id });
  });
}
