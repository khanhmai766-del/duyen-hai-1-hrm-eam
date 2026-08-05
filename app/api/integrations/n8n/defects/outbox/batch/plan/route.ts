import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildDefectSheetBatchWritePlan } from "@/lib/defect-sheet-write-plan";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";
import { isDefectSyncEventEnabled } from "@/lib/defect-two-way-sync";

export const dynamic = "force-dynamic";

function eventIdsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function requestTypeOf(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return String((payload as Record<string, unknown>).requestType ?? "").trim();
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!verifyDefectOutboxToken(req.headers.get("authorization"))) {
      return fail("Không có quyền lập kế hoạch ghi Sheet theo lô", 401);
    }
    const body = await req.json().catch(() => ({}));
    const eventIds = eventIdsOf(body?.eventIds);
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!eventIds.length) return fail("Lô đồng bộ không có sự kiện");
    if (eventIds.length > 50) return fail("Mỗi lô chỉ được xử lý tối đa 50 sự kiện");
    if (!rows) return fail("Thiếu dữ liệu A6:O đọc từ Sheet");

    const found = await prisma.defectSyncOutbox.findMany({ where: { id: { in: eventIds } } });
    if (found.length !== eventIds.length) return fail("Một hoặc nhiều sự kiện đồng bộ không tồn tại", 404);
    // UPDATE ... RETURNING ở bước claim không bảo đảm thứ tự hàng. Luôn dựng
    // kế hoạch theo thời điểm phát sinh để các CREATE được chèn đúng thứ tự STT
    // và các UPDATE/REMIND của cùng phiếu vẫn giữ đúng trình tự nghiệp vụ.
    const events = [...found].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        || left.id.localeCompare(right.id)
    );
    if (events.some((event) => event.status !== "PROCESSING")) {
      return fail("Một hoặc nhiều sự kiện không ở trạng thái đang xử lý", 409);
    }
    const featureStates = await Promise.all(
      [...new Set(events.map((event) => event.eventType))].map((eventType) =>
        isDefectSyncEventEnabled(eventType)
      )
    );
    if (featureStates.some((enabled) => !enabled)) {
      return fail("Lô chứa loại đồng bộ đang tạm tắt", 409);
    }
    const requestTypes = new Set(events.map((event) => requestTypeOf(event.payload)));
    if (requestTypes.size !== 1 || requestTypes.has("")) {
      return fail("Một lô chỉ được chứa sự kiện của cùng một trang tính khiếm khuyết", 409);
    }

    try {
      return ok({
        ...buildDefectSheetBatchWritePlan(events, rows),
        requestType: [...requestTypes][0],
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Không thể lập kế hoạch ghi Sheet theo lô", 409);
    }
  });
}
