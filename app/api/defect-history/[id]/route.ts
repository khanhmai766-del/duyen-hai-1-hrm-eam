import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { maybeUploadDataUrlList } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true } } };

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền cập nhật lịch sử khiếm khuyết");
    const body = await req.json();
    const images = Array.isArray(body.images)
      ? await maybeUploadDataUrlList(body.images.filter(Boolean).slice(0, 3), "defect-history/images", "image")
      : undefined;
    const existing = await prisma.defectHistory.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy lịch sử khiếm khuyết", 404);
    if (existing.device) await assertSeqEditable(user, existing.device);
    if (body.device) await assertSeqEditable(user, String(body.device));

    const history = await prisma.defectHistory.update({
      where: { id: params.id },
      data: {
        unit: body.unit !== undefined ? body.unit : undefined,
        device: body.device !== undefined ? body.device?.trim() || null : undefined,
        system: body.system !== undefined ? body.system?.trim() || null : undefined,
        requestType: body.requestType !== undefined ? body.requestType?.trim() || null : undefined,
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
    await requirePermissionLevel(user, "defect-close", ["approve", "manage", "full"], "Không đủ quyền xoá lịch sử khiếm khuyết");
    const existing = await prisma.defectHistory.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy lịch sử khiếm khuyết", 404);
    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: existing.device, system: existing.system })) {
      return fail("Cương vị của bạn không có quyền thao tác trên lịch sử khiếm khuyết này", 403);
    }
    await prisma.defectHistory.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_DEFECT_HISTORY", "DefectHistory", params.id);
    return ok({ id: params.id });
  });
}
