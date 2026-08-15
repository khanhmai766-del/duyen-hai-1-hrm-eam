import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { isDefectSyncFeatureEnabled } from "@/lib/defect-two-way-sync";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const [canManage, canClose] = await Promise.all([
      hasPermissionLevel(user, "defect-manage", ["manage", "full"]),
      hasPermissionLevel(user, "defect-close", ["manage", "full"]),
    ]);
    if (!canManage && !canClose) {
      return fail("Không đủ quyền cập nhật ghi chú khiếm khuyết", 403);
    }
    if (!(await isDefectSyncFeatureEnabled("UPDATE"))) {
      return fail("Tính năng cập nhật Vận hành từ website đang tạm khóa", 503);
    }

    const body = await req.json().catch(() => ({}));
    const note = String(body.note ?? "").trim();
    const existing = await prisma.defect.findUnique({
      where: { id: params.id },
      include: { pendingHistory: { select: { id: true } } },
    });
    if (!existing) return fail("Không tìm thấy phiếu khiếm khuyết", 404);
    if (!existing.pendingHistory || existing.syncState === "CONFIRMED") {
      return fail("Chỉ được cập nhật ghi chú bằng luồng này khi phiếu đang chờ chốt lịch sử", 409);
    }
    if (!(existing.sourceType === "GOOGLE_SHEETS" || existing.websiteCreated)) {
      return fail("Phiếu này không tham gia đồng bộ Google Sheet", 409);
    }

    const access = await resolveEquipmentAccessForUser(user);
    if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: existing.device, system: existing.system })) {
      return fail("Cương vị của bạn không có quyền cập nhật phiếu khiếm khuyết này", 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const defect = await tx.defect.update({
        where: { id: existing.id },
        data: { note, createdById: user.id },
      });
      await enqueueDefectSyncEvent(tx, {
        defect,
        eventType: "UPDATE",
        extra: { writeScope: "NOTE_ONLY" },
      });
      return defect;
    });

    await audit(
      user.id,
      "UPDATE_PENDING_DEFECT_NOTE",
      "Defect",
      updated.id,
      auditDetailWithPosition(user, `Cập nhật ghi chú cột 15: ${note || "(để trống)"}`)
    );
    return ok({ id: updated.id, note: updated.note });
  });
}
