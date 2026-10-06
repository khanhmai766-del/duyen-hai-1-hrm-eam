import type { PrismaClient } from "@prisma/client";
import { groundingRetentionWindow } from "@/lib/grounding-retention";

const ENTITIES = ["GroundingLightningItem", "GroundingLightningAttachment", "GroundingLightningInspection"];

export async function groundingRetentionCounts(db: PrismaClient, now = new Date()) {
  const { cutoff } = groundingRetentionWindow(now);
  const [inspections, results, auditLogs, systemTable] = await Promise.all([
    db.groundingLightningInspection.count({ where: { signedAt: { lt: cutoff } } }),
    db.groundingLightningInspectionResult.count({ where: { inspection: { signedAt: { lt: cutoff } } } }),
    db.auditLog.count({ where: { entity: { in: ENTITIES }, createdAt: { lt: cutoff } } }),
    db.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public."SystemAuditLog"') IS NOT NULL AS exists`,
  ]);
  const systemAuditLogs = systemTable[0]?.exists
    ? await db.systemAuditLog.count({ where: { targetType: { in: ENTITIES }, createdAt: { lt: cutoff } } }) : 0;
  return { cutoff, inspections, results, auditLogs, systemAuditLogs };
}

/** Chỉ xoá lịch sử quá hạn; kết quả InspectionResult đi theo FK Cascade. Không đụng S3. */
export async function purgeGroundingHistory(db: PrismaClient, now = new Date()) {
  const { cutoff } = groundingRetentionWindow(now);
  return db.$transaction(async (tx) => {
    const { count: inspections } = await tx.groundingLightningInspection.deleteMany({ where: { signedAt: { lt: cutoff } } });
    const { count: auditLogs } = await tx.auditLog.deleteMany({ where: { entity: { in: ENTITIES }, createdAt: { lt: cutoff } } });
    // Một số bản production chưa có SystemAuditLog; không để nó chặn việc dọn lịch sử.
    const table = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public."SystemAuditLog"') IS NOT NULL AS exists`;
    const systemAuditLogs = table[0]?.exists
      ? (await tx.systemAuditLog.deleteMany({ where: { targetType: { in: ENTITIES }, createdAt: { lt: cutoff } } })).count : 0;
    return { inspections, auditLogs, systemAuditLogs };
  });
}

let lastSuccessAt = 0;
let inFlight: Promise<void> | null = null;

/** Dọn khi mở trang, tối đa mỗi giờ; lỗi dọn không chặn người dùng xem. */
export function runGroundingRetention(db: PrismaClient, now = new Date()): Promise<void> {
  if (inFlight) return inFlight;
  if (Date.now() - lastSuccessAt < 3_600_000) return Promise.resolve();
  inFlight = (async () => {
    try {
      const counts = await purgeGroundingHistory(db, now);
      lastSuccessAt = Date.now();
      if (Object.values(counts).some((count) => count > 0)) console.info("[luu-tru-tiep-dia] Đã dọn lịch sử quá 1 tháng 15 ngày:", counts);
    } catch (error) {
      console.error("[luu-tru-tiep-dia] Không dọn được lịch sử:", error);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
