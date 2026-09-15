import type { Prisma } from "@prisma/client";
import { permitSnapshot } from "./work-permits";

export const INTERNAL_AUTO_CLOSE_DELAY = 24 * 60 * 60 * 1000;
export const INTERNAL_AUTO_CLOSE_ACTION = "Tự đóng theo SYC đã xử lý đủ 24 giờ";

/** Chạy trong giao dịch. Khóa SYC để thao tác mở lại không xen giữa kiểm tra và đóng. */
export async function closeDueInternalPermits(tx: Prisma.TransactionClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - INTERNAL_AUTO_CLOSE_DELAY);
  const defects = await tx.$queryRaw<Array<{ id: string; completedAt: Date }>>`
    SELECT d."id", d."completedAt" FROM "Defect" d
    WHERE d."status" = 'DA_XU_LY' AND d."cancelledAt" IS NULL
      AND d."completedAt" <= ${cutoff}
      AND EXISTS (SELECT 1 FROM "WorkPermit" p WHERE p."defectId" = d."id"
        AND p."teamType" = 'INTERNAL' AND p."issuedAt" IS NOT NULL
        AND p."issuedAt" <= ${now} AND (p."authorizedAt" IS NULL OR p."authorizedAt" <= ${now})
        AND p."status" IN ('ISSUED', 'ACTIVE', 'PAUSED', 'WAITING'))
    ORDER BY d."completedAt", d."id" LIMIT 100
    FOR UPDATE OF d SKIP LOCKED
  `;
  let closed = 0;
  for (const defect of defects) {
    const permits = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WorkPermit" WHERE "defectId" = ${defect.id}
        AND "teamType" = 'INTERNAL' AND "issuedAt" IS NOT NULL
        AND "issuedAt" <= ${now} AND ("authorizedAt" IS NULL OR "authorizedAt" <= ${now})
        AND "status" IN ('ISSUED', 'ACTIVE', 'PAUSED', 'WAITING')
      ORDER BY "id" LIMIT 100 FOR UPDATE SKIP LOCKED
    `;
    for (const { id } of permits) {
      const before = await tx.workPermit.findUniqueOrThrow({ where: { id } });
      const closedAt = new Date(Math.max(defect.completedAt.getTime() + INTERNAL_AUTO_CLOSE_DELAY, before.issuedAt!.getTime(), before.authorizedAt?.getTime() ?? 0));
      if (closedAt > now) continue;
      const result = [before.result, INTERNAL_AUTO_CLOSE_ACTION, "Chỉ đóng bản ghi trong sổ, không xác minh hay thay đổi trạng thái trên NKVH / phiếu giấy."].filter(Boolean).join("\n");
      const after = await tx.workPermit.update({ where: { id }, data: { status: "CLOSED", closedAt, result, version: { increment: 1 } } });
      await tx.workPermitHistory.create({ data: {
        permitId: id, actorId: "SYSTEM", actorName: "Hệ thống", action: INTERNAL_AUTO_CLOSE_ACTION,
        before: permitSnapshot(before), after: permitSnapshot({ ...after, autoCloseDefectCompletedAt: defect.completedAt.toISOString() }),
      } });
      closed++;
      if (closed >= 100) return closed;
    }
  }
  return closed;
}
