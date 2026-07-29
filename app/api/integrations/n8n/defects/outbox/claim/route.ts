import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";

export const dynamic = "force-dynamic";

type ClaimedEvent = {
  id: string;
  defectId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
  createdAt: Date;
};

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyDefectOutboxToken(req.headers.get("authorization"))) {
      return fail("Không có quyền lấy hàng đợi đồng bộ", 401);
    }

    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const limit = Number.isInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 20;
    const exclusive = ["1", "true", "yes"].includes(
      String(req.nextUrl.searchParams.get("exclusive") ?? "").toLowerCase()
    );

    const events = await prisma.$transaction(async (tx) => {
      if (exclusive) {
        // Một worker tối ưu xử lý trọn một lô. Advisory lock đóng khe thời gian
        // giữa bước kiểm tra và claim khi hai Schedule Trigger đến cùng lúc.
        // PostgreSQL trả `void`; ép sang text để Prisma không lỗi deserialize P2010.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(2026072901)::text AS "locked"`;
      }
      // Thu hồi event bị worker giữ quá lâu do n8n dừng giữa chừng.
      await tx.$executeRaw`
        UPDATE "DefectSyncOutbox"
        SET "status" = 'PENDING',
            "claimedAt" = NULL,
            "nextAttemptAt" = NOW(),
            "lastError" = COALESCE("lastError", 'Thu hồi sau khi worker hết thời gian xử lý'),
            "updatedAt" = NOW()
        WHERE "status" = 'PROCESSING'
          AND "claimedAt" < NOW() - INTERVAL '15 minutes'
      `;

      if (exclusive) {
        const processing = await tx.defectSyncOutbox.count({ where: { status: "PROCESSING" } });
        if (processing > 0) return [];
      }

      return tx.$queryRaw<ClaimedEvent[]>(Prisma.sql`
        WITH picked AS (
          SELECT "id"
          FROM "DefectSyncOutbox"
          WHERE "status" IN ('PENDING', 'FAILED')
            AND "nextAttemptAt" <= NOW()
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE "DefectSyncOutbox" AS event
        SET "status" = 'PROCESSING',
            "claimedAt" = NOW(),
            "attemptCount" = event."attemptCount" + 1,
            "updatedAt" = NOW()
        FROM picked
        WHERE event."id" = picked."id"
        RETURNING event."id", event."defectId", event."eventType",
                  event."payload", event."attemptCount", event."createdAt"
      `);
    });

    return ok(events);
  });
}
