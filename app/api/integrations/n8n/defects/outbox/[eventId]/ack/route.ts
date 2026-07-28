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

    const event = await prisma.defectSyncOutbox.update({
      where: { id: existing.id },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        claimedAt: null,
        lastError: null,
      },
    });
    return ok(event);
  });
}
