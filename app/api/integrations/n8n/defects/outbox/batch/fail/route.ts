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
      return fail("Không có quyền báo lỗi lô đồng bộ", 401);
    }
    const body = await req.json().catch(() => ({}));
    const eventIds = eventIdsOf(body?.eventIds);
    if (!eventIds.length) return fail("Lô báo lỗi không có sự kiện");
    if (eventIds.length > 50) return fail("Mỗi lô chỉ được báo lỗi tối đa 50 sự kiện");
    const message = String(body?.error ?? "n8n không ghi được Google Sheet")
      .trim()
      .slice(0, 2_000);

    const events = await prisma.defectSyncOutbox.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, status: true, attemptCount: true },
    });
    if (events.length !== eventIds.length) return fail("Một hoặc nhiều sự kiện đồng bộ không tồn tại", 404);
    if (events.some((event) => !["PROCESSING", "SUCCESS"].includes(event.status))) {
      return fail("Một hoặc nhiều sự kiện không ở trạng thái có thể báo lỗi", 409);
    }

    await prisma.$transaction(events
      .filter((event) => event.status === "PROCESSING")
      .map((event) => prisma.defectSyncOutbox.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          claimedAt: null,
          lastError: message,
          nextAttemptAt: new Date(
            Date.now() + Math.min(60, 2 ** Math.min(event.attemptCount, 6)) * 60_000
          ),
        },
      })));
    return ok({ requested: eventIds.length });
  });
}
