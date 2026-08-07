import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, assertPeriodOpen, type PcccTargetType } from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

const TARGETS: PcccTargetType[] = ["EXTINGUISHER", "CABINET", "BULK", "FM200_PANEL"];

/** Trả về (kỳ, nhãn để ghi audit) của mục tiêu ký. */
async function locateTarget(targetType: PcccTargetType, targetId: string) {
  if (targetType === "EXTINGUISHER") {
    const r = await prisma.pcccExtinguisher.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ma };
  }
  if (targetType === "CABINET") {
    const r = await prisma.pcccCabinet.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ma };
  }
  if (targetType === "BULK") {
    const r = await prisma.pcccBulk.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ten };
  }
  const r = await prisma.pcccFm200Panel.findUnique({ where: { id: targetId }, include: { period: true } });
  return r && { period: r.period, label: r.title };
}

function parseBody(body: unknown) {
  const { targetType, targetId } = (body ?? {}) as { targetType?: string; targetId?: string };
  if (!targetType || !TARGETS.includes(targetType as PcccTargetType)) throw fail("targetType không hợp lệ");
  if (!targetId) throw fail("Thiếu targetId");
  return { targetType: targetType as PcccTargetType, targetId };
}

// POST /api/pccc/signatures { targetType, targetId } -> ký xác nhận
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.manage, ["personal", "manage", "full"], "Không đủ quyền ký");

    const { targetType, targetId } = parseBody(await req.json());
    const found = await locateTarget(targetType, targetId);
    if (!found) return fail("Không tìm thấy mục cần ký", 404);
    assertPeriodOpen(found.period);

    const signature = await prisma.pcccSignature.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      update: { userId: user.id, signerName: user.name ?? "", signerPosition: user.position ?? null, signedAt: new Date() },
      create: {
        periodId: found.period.id,
        targetType,
        targetId,
        userId: user.id,
        signerName: user.name ?? "",
        signerPosition: user.position ?? null,
      },
    });

    await audit(
      user.id,
      "SIGN_PCCC",
      "PcccSignature",
      signature.id,
      auditDetailWithPosition(user, `Ký ${targetType} · ${found.period.label} · ${found.label}`)
    );
    return ok(signature);
  });
}

// DELETE /api/pccc/signatures { targetType, targetId } -> huỷ ký
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.manage, ["manage", "full"], "Không đủ quyền huỷ ký");

    const { targetType, targetId } = parseBody(await req.json());
    const found = await locateTarget(targetType, targetId);
    if (!found) return fail("Không tìm thấy mục cần huỷ ký", 404);
    assertPeriodOpen(found.period);

    await prisma.pcccSignature.deleteMany({ where: { targetType, targetId } });
    await audit(
      user.id,
      "UNSIGN_PCCC",
      "PcccSignature",
      targetId,
      auditDetailWithPosition(user, `Huỷ ký ${targetType} · ${found.period.label} · ${found.label}`)
    );
    return ok({ targetType, targetId });
  });
}
