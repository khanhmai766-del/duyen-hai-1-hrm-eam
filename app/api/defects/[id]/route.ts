import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { normalizeImpactValue } from "@/lib/defect-impact-fields";
import { maybeUploadDataUrl, publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { resolveDefectShiftLeader } from "@/lib/defect-shift-leader";
import { normalizeDefectSeverityCriteria } from "@/lib/constants";

// Tầng 4: avatar trong payload đi qua publicUserRef (proxy theo key) — không chở base64.
const INCLUDE = { createdBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } } };

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-manage", ["manage", "full"], "Không đủ quyền cập nhật khiếm khuyết");
    const body = await req.json();
    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    if (existing.device) await assertSeqEditable(user, existing.device);
    if (body.device) await assertSeqEditable(user, String(body.device));
    if (body.shiftLeaderId !== undefined && !String(body.shiftLeaderId ?? "").trim()) {
      return fail("Vui lòng chọn Trưởng ca");
    }
    if (body.shiftLeaderId === undefined && !existing.shiftLeaderId) {
      return fail("Vui lòng chọn Trưởng ca");
    }
    const shiftLeader = body.shiftLeaderId !== undefined
      ? await resolveDefectShiftLeader(body.shiftLeaderId)
      : undefined;
    if (body.shiftLeaderId && !shiftLeader) return fail("Nhân viên được chọn không có cương vị Trưởng ca hoặc đã ngừng hoạt động");
    const imageUrl =
      body.imageUrl !== undefined
        ? await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "defects/images", preset: "image" })
        : undefined;
    // Đồng bộ khóa chuẩn deviceSeq khi client gửi trường device (chỉ gán seq có thật trong cây).
    const deviceSeq =
      body.device !== undefined
        ? body.device
          ? (await prisma.equipmentNode.findUnique({ where: { seq: String(body.device) }, select: { seq: true } }))?.seq ?? null
          : null
        : undefined;
    const defect = await prisma.defect.update({
      where: { id: params.id },
      data: {
        unit: body.unit,
        device: body.device !== undefined ? body.device || null : undefined,
        deviceSeq,
        system: body.system !== undefined ? body.system || null : undefined,
        severity: body.severity !== undefined ? body.severity || null : undefined,
        severityCriteria:
          body.severity !== undefined || body.severityCriteria !== undefined
            ? normalizeDefectSeverityCriteria(body.severity ?? existing.severity, body.severityCriteria ?? existing.severityCriteria)
            : undefined,
        condition: body.condition !== undefined ? body.condition || null : undefined,
        requestType: body.requestType !== undefined ? body.requestType || null : undefined,
        requestNumber: body.requestNumber !== undefined ? body.requestNumber?.trim() || null : undefined,
        content: body.content !== undefined ? body.content?.trim() || null : undefined,
        status: body.status,
        detectedAt: body.detectedAt !== undefined ? (body.detectedAt ? parseDateInput(body.detectedAt) : null) : undefined,
        shiftLeaderId: body.shiftLeaderId !== undefined ? shiftLeader?.id ?? null : undefined,
        shiftLeaderName: body.shiftLeaderId !== undefined ? shiftLeader?.name ?? null : undefined,
        note: body.note !== undefined ? body.note?.trim() || null : undefined,
        imageUrl,
        // Khi gửi 1 trong 2 trường ảnh hưởng thì cập nhật cả hai (giữ nguyên hành vi cũ);
        // không gửi gì thì để undefined → Prisma bỏ qua, không đổi giá trị.
        fireSafetyImpact:
          body.fireSafetyImpact !== undefined || body.environmentSafetyImpact !== undefined
            ? normalizeImpactValue(body.fireSafetyImpact)
            : undefined,
        environmentSafetyImpact:
          body.fireSafetyImpact !== undefined || body.environmentSafetyImpact !== undefined
            ? normalizeImpactValue(body.environmentSafetyImpact)
            : undefined,
      },
      include: INCLUDE,
    });
    await audit(user.id, "UPDATE_DEFECT", "Defect", defect.id);
    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "defect-close", ["approve", "manage", "full"], "Không đủ quyền xoá khiếm khuyết");
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
