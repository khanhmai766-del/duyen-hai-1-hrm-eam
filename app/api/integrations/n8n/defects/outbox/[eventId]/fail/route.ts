import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  return handle(async () => {
    if (!verifyDefectOutboxToken(req.headers.get("authorization"))) {
      return fail("Không có quyền báo lỗi đồng bộ", 401);
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body?.error ?? "n8n không ghi được Google Sheet").trim().slice(0, 2_000);
    const existing = await prisma.defectSyncOutbox.findUnique({ where: { id: params.eventId } });
    if (!existing) return fail("Không tìm thấy sự kiện đồng bộ", 404);
    if (existing.status === "SUCCESS") return ok(existing);
    if (existing.status !== "PROCESSING") return fail("Sự kiện không ở trạng thái đang xử lý", 409);

    const delayMinutes = Math.min(60, 2 ** Math.min(existing.attemptCount, 6));
    const event = await prisma.defectSyncOutbox.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        claimedAt: null,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
      },
    });
    return ok(event);
  });
}
