import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { publicUserRef } from "@/lib/s3";
import { requirePermissionLevel } from "@/lib/rbac-guard";

const INCLUDE = {
  createdBy: {
    select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true },
  },
  relatedDevices: {
    select: { deviceSeq: true, device: { select: { seq: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

    const access = await resolveEquipmentAccessForUser(user);
    if (
      access.hasExplicitScopes &&
      !access.canEditDeviceLike({ device: existing.device, system: existing.system })
    ) {
      return fail("Cương vị của bạn không có quyền thao tác trên phiếu khiếm khuyết này", 403);
    }

    const defect = await prisma.defect.update({
      where: { id: existing.id },
      data: {
        reminderCount: { increment: 1 },
        lastRemindedAt: new Date(),
      },
      include: INCLUDE,
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
