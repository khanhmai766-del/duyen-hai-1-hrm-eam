import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { s3ProxyUrl } from "@/lib/s3";
import {
  PCCC_PERMISSION,
  assertPcccScope,
  assertPeriodWritable,
  resolvePcccWriteScope,
  signatureKeyOfUser,
  PCCC_SIGNATURE_SETUP_URL,
  type PcccTargetType,
} from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

const TARGETS: PcccTargetType[] = [
  "EXTINGUISHER", "CABINET", "BULK", "FM200_PANEL",
  "ALARM_BUTTON", "VALVE", "EMERGENCY_LIGHT", "HOSE_REEL",
];

/** Trả về (kỳ, cương vị của mục tiêu, nhãn để ghi audit). Cương vị dùng để chặn ký ngoài phạm vi. */
async function locateTarget(targetType: PcccTargetType, targetId: string) {
  if (targetType === "EXTINGUISHER") {
    const r = await prisma.pcccExtinguisher.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ma, cuongViCode: r.cuongViCode };
  }
  if (targetType === "CABINET") {
    const r = await prisma.pcccCabinet.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ma, cuongViCode: r.cuongViCode };
  }
  if (targetType === "BULK") {
    const r = await prisma.pcccBulk.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ten, cuongViCode: r.cuongViCode };
  }
  if (targetType === "ALARM_BUTTON") {
    const r = await prisma.pcccAlarmButton.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.maKks, cuongViCode: r.cuongViCode };
  }
  if (targetType === "VALVE") {
    const r = await prisma.pcccValve.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.maKks, cuongViCode: r.cuongViCode };
  }
  if (targetType === "EMERGENCY_LIGHT") {
    const r = await prisma.pcccEmergencyLight.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: `${r.loai} · ${r.maKks}`, cuongViCode: r.cuongViCode };
  }
  if (targetType === "HOSE_REEL") {
    const r = await prisma.pcccHoseReel.findUnique({ where: { id: targetId }, include: { period: true } });
    return r && { period: r.period, label: r.ma, cuongViCode: r.cuongViCode };
  }
  const r = await prisma.pcccFm200Panel.findUnique({ where: { id: targetId }, include: { period: true } });
  return r && { period: r.period, label: r.title, cuongViCode: r.cuongViCode };
}

/**
 * Ghi "Người / Ngày kiểm tra" lên đúng bảng của mục tiêu vừa ký. Ký mà không ghi hai
 * cột đó thì tháng sau không ai biết ai đi kiểm tra và kiểm tra hôm nào.
 *
 * BULK không nằm ở đây vì nó gọi hai cột là "Ngày chốt / Người chốt" — xử lý riêng
 * tại chỗ dùng.
 */
const INSPECTION_STAMP_UPDATERS: Record<
  Exclude<PcccTargetType, "BULK">,
  (id: string, nguoiKiemTra: string, ngayKiemTra: Date) => Prisma.PrismaPromise<unknown>
> = {
  EXTINGUISHER: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccExtinguisher.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
  CABINET: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccCabinet.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
  FM200_PANEL: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccFm200Panel.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
  ALARM_BUTTON: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccAlarmButton.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
  VALVE: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccValve.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
  EMERGENCY_LIGHT: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccEmergencyLight.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
  HOSE_REEL: (id, nguoiKiemTra, ngayKiemTra) => prisma.pcccHoseReel.update({ where: { id }, data: { nguoiKiemTra, ngayKiemTra } }),
};

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
    const { targetType, targetId } = parseBody(await req.json());
    // Ký là chữ ký xác nhận của CƯƠNG VỊ phụ trách, nên phạm vi ký = phạm vi ghi. Tính
    // theo BẢNG vì bảng Tủ chữa cháy có cương vị được giao trọn bảng (pccc-service.ts).
    const scope = await resolvePcccWriteScope(user, "Không đủ quyền ký", targetType);
    const found = await locateTarget(targetType, targetId);
    if (!found) return fail("Không tìm thấy mục cần ký", 404);
    assertPeriodWritable(found.period);
    assertPcccScope(scope, found);

    // Chữ ký PCCC là ảnh chữ ký số trong hồ sơ cá nhân, không phải mỗi cái tên gõ ra.
    const signatureKey = await signatureKeyOfUser(user.id);
    if (!signatureKey) {
      return fail(
        `Tài khoản của bạn chưa có chữ ký số. Vào ${PCCC_SIGNATURE_SETUP_URL} → mục "Chữ ký số" để thêm rồi ký lại.`,
        409
      );
    }

    const signedAt = new Date();
    const signerName = user.name ?? user.email ?? "";

    // Ký kéo theo NGƯỜI và NGÀY kiểm tra, y như ký hàng loạt — ký mà không ghi hai cột
    // đó thì tháng sau không ai biết ai đi kiểm tra và kiểm tra hôm nào. Bảng bồn
    // Foam/CO2/Diesel gọi hai cột này là "Ngày chốt / Người chốt".
    // Bảng tra thay cho chuỗi ternary lồng: tám mục tiêu ký thì chuỗi ternary vừa
    // khó đọc vừa dễ nối nhầm nhánh. Bồn Foam/CO2/Diesel gọi hai cột này là
    // "Ngày chốt / Người chốt", còn lại đều là "Ngày / Người kiểm tra".
    const stampInspector =
      targetType === "BULK"
        ? prisma.pcccBulk.update({ where: { id: targetId }, data: { nguoiChot: signerName, ngayChot: signedAt } })
        : INSPECTION_STAMP_UPDATERS[targetType](targetId, signerName, signedAt);

    const [, signature] = await prisma.$transaction([
      stampInspector,
      prisma.pcccSignature.upsert({
        where: { targetType_targetId: { targetType, targetId } },
        update: { userId: user.id, signerName, signerPosition: user.position ?? null, signatureKey, signedAt },
        create: {
          periodId: found.period.id,
          targetType,
          targetId,
          userId: user.id,
          signerName,
          signerPosition: user.position ?? null,
          signatureKey,
        },
      }),
    ]);

    await audit(
      user.id,
      "SIGN_PCCC",
      "PcccSignature",
      signature.id,
      auditDetailWithPosition(user, `Ký ${targetType} · ${found.period.label} · ${found.label}`)
    );
    return ok({ ...signature, signatureUrl: s3ProxyUrl(signatureKey, "chu-ky.png") });
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
    assertPeriodWritable(found.period);

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
