import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildDefectSheetWritePlan } from "@/lib/defect-sheet-write-plan";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";
import { isDefectSyncEventEnabled } from "@/lib/defect-two-way-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  return handle(async () => {
    if (!verifyDefectOutboxToken(req.headers.get("authorization"))) {
      return fail("Không có quyền lập kế hoạch ghi Sheet", 401);
    }
    const event = await prisma.defectSyncOutbox.findUnique({ where: { id: params.eventId } });
    if (!event) return fail("Không tìm thấy sự kiện đồng bộ", 404);
    if (event.status !== "PROCESSING") return fail("Sự kiện không ở trạng thái đang xử lý", 409);
    if (!(await isDefectSyncEventEnabled(event.eventType))) {
      return fail("Loại đồng bộ này đang tạm tắt", 409);
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows) return fail("Thiếu dữ liệu A6:O đọc từ Sheet bản sao");

    try {
      return ok(buildDefectSheetWritePlan(event, rows));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Không thể lập kế hoạch ghi Sheet", 409);
    }
  });
}
