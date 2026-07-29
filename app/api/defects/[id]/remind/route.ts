import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { enqueueDefectSyncEvent } from "@/lib/defect-sync-outbox";
import { resolveDefectShiftLeader } from "@/lib/defect-shift-leader";

const INCLUDE = {
  createdBy: {
    select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true },
  },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "defect-manage",
      ["create", "manage", "full"],
      "Không đủ quyền nhắc lại khiếm khuyết"
    );

    const existing = await prisma.defect.findUnique({ where: { id: params.id } });
    if (!existing) return fail("Không tìm thấy khiếm khuyết", 404);
    if (existing.status === "DA_XU_LY") {
      return fail("Khiếm khuyết đã xử lý, không thể nhắc lại");
    }
    const body = await req.json().catch(() => ({}));
    const shiftLeaderId = String(body.shiftLeaderId ?? "").trim();
    if (!shiftLeaderId) return fail("Vui lòng chọn Trưởng ca cho lần nhắc lại");
    const shiftLeader = await resolveDefectShiftLeader(shiftLeaderId);
    if (!shiftLeader) {
      return fail("Nhân viên được chọn không có cương vị Trưởng ca hoặc đã ngừng hoạt động");
    }

    const access = await resolveEquipmentAccessForUser(user);
    if (
      access.hasExplicitScopes &&
      !access.canEditDeviceLike({ device: existing.device, system: existing.system })
    ) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }

    const remindedAt = new Date();
    // Lịch sử nhắc lại là dữ liệu nghiệp vụ nên luôn được ghi, không phụ thuộc cờ
    // tích hợp. Cập nhật bộ đếm và tạo log trong cùng transaction để retry sau lỗi
    // không làm tăng số lần nhưng thiếu ngày tương ứng.
    const defect = await prisma.$transaction(async (tx) => {
      const updated = await tx.defect.update({
        where: { id: existing.id },
        data: {
          createdById: user.id,
          reminderCount: { increment: 1 },
          lastRemindedAt: remindedAt,
        },
        include: INCLUDE,
      });
      const reminderLog = await tx.defectReminderLog.create({
        data: {
          defectId: updated.id,
          occurredAt: remindedAt,
          createdById: user.id,
          shiftLeaderId: shiftLeader.id,
          shiftLeaderName: shiftLeader.name,
        },
      });
      const reminderHistory = await tx.defectReminderLog.findMany({
        where: { defectId: updated.id },
        orderBy: { occurredAt: "asc" },
        select: { id: true, occurredAt: true, shiftLeaderName: true },
      });
      const legacyReminderCount = Math.max(0, updated.reminderCount - reminderHistory.length);
      await enqueueDefectSyncEvent(tx, {
        defect: updated,
        eventType: "REMIND",
        extra: {
          reminderLogId: reminderLog.id,
          remindedAt: remindedAt.toISOString(),
          reminderNumber: updated.reminderCount,
          reminderShiftLeader: shiftLeader.name,
          legacyReminderRaw: existing.reminderRaw ?? "",
          writeScope:
            existing.sourceType === "GOOGLE_SHEETS" && !existing.websiteCreated
              ? "SHEET_ORIGIN_LIMITED"
              : "FULL",
          reminderHistory: reminderHistory.map((item, index) => ({
            reminderLogId: item.id,
            reminderNumber: legacyReminderCount + index + 1,
            remindedAt: item.occurredAt.toISOString(),
            shiftLeader: item.shiftLeaderName ?? updated.shiftLeaderName ?? "",
          })),
        },
      });
      return updated;
    });

    await audit(
      user.id,
      "REMIND_DEFECT",
      "Defect",
      defect.id,
      auditDetailWithPosition(user, `${defect.requestNumber ?? "Không có số yêu cầu"} · Lần ${defect.reminderCount}`)
    );
    return ok({ ...defect, createdBy: publicUserRef(defect.createdBy) });
  });
}
