import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";

export const dynamic = "force-dynamic";

function eventIdsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyDefectOutboxToken(req.headers.get("authorization"))) {
      return fail("Không có quyền xác nhận lô đồng bộ", 401);
    }
    const body = await req.json().catch(() => ({}));
    const eventIds = eventIdsOf(body?.eventIds);
    if (!eventIds.length) return fail("Lô xác nhận không có sự kiện");
    if (eventIds.length > 50) return fail("Mỗi lô chỉ được xác nhận tối đa 50 sự kiện");

    const result = await prisma.$transaction(async (tx) => {
      const events = await tx.defectSyncOutbox.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, defectId: true, status: true, payload: true },
      });
      if (events.length !== eventIds.length) throw new Error("Một hoặc nhiều sự kiện đồng bộ không tồn tại");
      if (events.some((event) => !["PROCESSING", "SUCCESS"].includes(event.status))) {
        throw new Error("Một hoặc nhiều sự kiện không ở trạng thái có thể xác nhận");
      }
      const updated = await tx.defectSyncOutbox.updateMany({
        where: { id: { in: eventIds }, status: "PROCESSING" },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          claimedAt: null,
          lastError: null,
        },
      });
      const cancellationDefectIds = events
        .filter(
          (event) =>
            event.payload
            && typeof event.payload === "object"
            && !Array.isArray(event.payload)
            && event.payload.cancellation === true
        )
        .map((event) => event.defectId);
      if (cancellationDefectIds.length) {
        await tx.defect.updateMany({
          where: {
            id: { in: cancellationDefectIds },
            cancelledAt: { not: null },
          },
          data: { syncState: "CONFIRMED", requestNumberReleasedAt: new Date() },
        });
      }
      return { requested: eventIds.length, updated: updated.count };
    }).catch((error) => {
      throw fail(error instanceof Error ? error.message : "Không thể xác nhận lô đồng bộ", 409);
    });
    return ok(result);
  });
}
