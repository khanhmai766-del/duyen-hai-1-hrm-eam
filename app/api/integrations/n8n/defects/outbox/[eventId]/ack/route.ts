import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  return handle(async () => {
    if (!verifyDefectOutboxToken(req.headers.get("authorization"))) {
      return fail("Không có quyền xác nhận đồng bộ", 401);
    }

    const existing = await prisma.defectSyncOutbox.findUnique({ where: { id: params.eventId } });
    if (!existing) return fail("Không tìm thấy sự kiện đồng bộ", 404);
    if (existing.status === "SUCCESS") return ok(existing);
    if (existing.status !== "PROCESSING") return fail("Sự kiện không ở trạng thái đang xử lý", 409);

    const cancellation =
      existing.payload
      && typeof existing.payload === "object"
      && !Array.isArray(existing.payload)
      && existing.payload.cancellation === true;
    const event = await prisma.$transaction(async (tx) => {
      const updated = await tx.defectSyncOutbox.update({
        where: { id: existing.id },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          claimedAt: null,
          lastError: null,
        },
      });
      if (cancellation) {
        await tx.defect.updateMany({
          where: { id: existing.defectId, cancelledAt: { not: null } },
          data: { syncState: "CONFIRMED", requestNumberReuseEligible: false },
        });
      }
      return updated;
    });
    return ok(event);
  });
}
