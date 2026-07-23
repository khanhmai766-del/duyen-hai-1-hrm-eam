import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { parseDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function assertCanEditLog(user: Awaited<ReturnType<typeof requireUser>>, id: string, levels: Array<"manage" | "full">) {
  await requirePermissionLevel(user, "replacement-manage", levels, "Không đủ quyền thao tác lịch sử thay thế vật tư");
  const log = await prisma.materialReplacementLog.findUnique({
    where: { id },
    include: { replacement: { select: { id: true, deviceSeq: true, system: true } } },
  });
  if (!log) throw fail("Không tìm thấy ghi nhận thay thế", 404);

  const access = await resolveEquipmentAccessForUser(user);
  if (
    access.hasExplicitScopes &&
    (!log.replacement || !access.canEditDeviceLike({ device: log.replacement.deviceSeq, system: log.replacement.system }))
  ) {
    throw fail("Cương vị của bạn không có quyền thao tác trên ghi nhận thay thế này", 403);
  }
  return log;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanEditLog(user, params.id, ["manage", "full"]);

    const body = await req.json().catch(() => ({}));
    const replacedAtText = String(body.replacedAt || "").trim();
    if (!replacedAtText) return fail("Vui lòng chọn ngày thay thế");
    const replacedAt = parseDateInput(replacedAtText);
    if (Number.isNaN(replacedAt.getTime())) return fail("Ngày thay thế không hợp lệ");

    const quantityRaw = body.quantity;
    let quantity: number | null = null;
    if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== "") {
      const n = Number(quantityRaw);
      if (!Number.isFinite(n) || n < 0) return fail("Số lượng thay thế không hợp lệ");
      quantity = Math.trunc(n);
    }

    const log = await prisma.materialReplacementLog.update({
      where: { id: params.id },
      data: {
        replacedAt,
        quantity,
        note: body.note?.trim() || null,
      },
    });
    await audit(user.id, "UPDATE_REPLACEMENT_LOG", "MaterialReplacementLog", log.id, auditDetailWithPosition(user));
    return ok(log);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanEditLog(user, params.id, ["full"]);

    await prisma.materialReplacementLog.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPLACEMENT_LOG", "MaterialReplacementLog", params.id, auditDetailWithPosition(user));
    return ok({ id: params.id });
  });
}
