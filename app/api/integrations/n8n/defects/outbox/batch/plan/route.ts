import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  buildDefectSheetBatchWritePlan,
  DefectSheetRequestNumberConflictError,
  usedDefectRequestNumbersFromSheet,
} from "@/lib/defect-sheet-write-plan";
import { verifyDefectOutboxToken } from "@/lib/defect-sync-outbox";
import { isDefectSyncEventEnabled } from "@/lib/defect-two-way-sync";
import { nextDefectRequestNumber } from "@/lib/defect-request-number";

export const dynamic = "force-dynamic";

function eventIdsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function requestTypeOf(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return String((payload as Record<string, unknown>).requestType ?? "").trim();
}

function requestNumberOf(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return String((payload as Record<string, unknown>).requestNumber ?? "").trim();
}

function withRequestNumber(payload: unknown, requestNumber: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload sự kiện đồng bộ không hợp lệ");
  }
  return { ...(payload as Record<string, unknown>), requestNumber };
}

function requestYear(requestNumber: string) {
  const match = requestNumber.match(/\/(\d{4})$/);
  const year = Number(match?.[1]);
  if (!Number.isInteger(year)) throw new Error(`Không xác định được năm của số ${requestNumber}`);
  return year;
}

async function reassignConflictingCreate(
  eventId: string,
  occupiedNumbers: Set<string>
) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.defectSyncOutbox.findUnique({ where: { id: eventId } });
    if (!event || event.eventType !== "CREATE" || event.status !== "PROCESSING") {
      throw new Error("Sự kiện tạo phiếu không còn ở trạng thái có thể cấp lại số");
    }
    const oldNumber = requestNumberOf(event.payload);
    const requestType = requestTypeOf(event.payload);
    const defect = await tx.defect.findUnique({
      where: { id: event.defectId },
      select: { id: true, requestNumber: true, websiteCreated: true, sourceKey: true, createdById: true },
    });
    if (!defect) {
      throw new Error(`Phiếu ${oldNumber} không còn tồn tại; hãy bỏ qua sự kiện CREATE mồ côi trên website`);
    }
    if (!defect.websiteCreated) {
      throw new Error(`Phiếu ${oldNumber} không phải phiếu tạo từ website; hãy bỏ qua sự kiện CREATE sai nguồn`);
    }
    if (defect.sourceKey) {
      throw new Error(`Phiếu ${oldNumber} đã liên kết với Google Sheet; hãy bỏ qua sự kiện CREATE trùng nguồn`);
    }

    // Một lượt lập kế hoạch trước có thể đã đổi STT trong DB nhưng n8n mất kết
    // nối trước khi nhận response. Khi retry bằng event đã claim, payload cũ có
    // thể vẫn được giữ trong bộ nhớ của workflow. Đồng bộ toàn bộ outbox theo STT
    // hiện tại rồi dựng lại kế hoạch, thay vì để lô mắc kẹt với thông báo chung.
    if (defect.requestNumber && defect.requestNumber !== oldNumber) {
      const queued = await tx.defectSyncOutbox.findMany({
        where: { defectId: defect.id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
        select: { id: true, payload: true },
      });
      for (const item of queued) {
        await tx.defectSyncOutbox.update({
          where: { id: item.id },
          data: { payload: withRequestNumber(item.payload, defect.requestNumber) },
        });
      }
      return { oldNumber, newNumber: defect.requestNumber };
    }
    if (!defect.requestNumber) {
      throw new Error(`Phiếu ${oldNumber} hiện không có STT; cần điều chỉnh STT trên website trước khi đồng bộ lại`);
    }
    const alreadySent = await tx.defectSyncOutbox.count({
      where: { defectId: defect.id, eventType: "CREATE", status: "SUCCESS" },
    });
    if (alreadySent) throw new Error(`Phiếu ${oldNumber} đã từng ghi Sheet, không thể tự đổi số`);

    let newNumber = "";
    const maxAttempts = occupiedNumbers.size + 10;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = await nextDefectRequestNumber(tx, requestYear(oldNumber), requestType);
      if (!occupiedNumbers.has(candidate.toUpperCase())) {
        newNumber = candidate;
        break;
      }
    }
    if (!newNumber) throw new Error(`Không tìm được số mới an toàn thay cho ${oldNumber}`);

    await tx.defect.update({ where: { id: defect.id }, data: { requestNumber: newNumber } });
    const queued = await tx.defectSyncOutbox.findMany({
      where: { defectId: defect.id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
      select: { id: true, payload: true },
    });
    for (const item of queued) {
      await tx.defectSyncOutbox.update({
        where: { id: item.id },
        data: { payload: withRequestNumber(item.payload, newNumber) },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: defect.createdById,
        action: "RENUMBER_DEFECT_ON_SHEET_CONFLICT",
        entity: "Defect",
        entityId: defect.id,
        detail: `Tự động đổi số yêu cầu từ ${oldNumber} sang ${newNumber} vì số cũ đã có phiếu khác trên Google Sheet`,
      },
    });
    return { oldNumber, newNumber };
  });
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

    let found = await prisma.defectSyncOutbox.findMany({ where: { id: { in: eventIds } } });
    if (found.length !== eventIds.length) return fail("Một hoặc nhiều sự kiện đồng bộ không tồn tại", 404);
    // UPDATE ... RETURNING ở bước claim không bảo đảm thứ tự hàng. Luôn dựng
    // kế hoạch theo thời điểm phát sinh để các CREATE được chèn đúng thứ tự STT
    // và các UPDATE/REMIND của cùng phiếu vẫn giữ đúng trình tự nghiệp vụ.
    let events = [...found].sort(
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
      const renumbered: Array<{ oldNumber: string; newNumber: string }> = [];
      const occupiedNumbers = usedDefectRequestNumbersFromSheet(rows);
      // Một lô thường không có xung đột. Chỉ khi CREATE đụng đúng một phiếu
      // khác trên Sheet mới cấp lại số và dựng lại toàn bộ kế hoạch.
      for (let attempt = 0; attempt <= events.length; attempt += 1) {
        try {
          return ok({
            ...buildDefectSheetBatchWritePlan(events, rows),
            requestType: [...requestTypes][0],
            renumbered,
          });
        } catch (error) {
          if (!(error instanceof DefectSheetRequestNumberConflictError)) throw error;
          const conflict = events.find(
            (event) => event.eventType === "CREATE" && requestNumberOf(event.payload) === error.requestNumber
          );
          if (!conflict) throw error;
          const changed = await reassignConflictingCreate(conflict.id, occupiedNumbers);
          renumbered.push(changed);
          occupiedNumbers.add(changed.newNumber.toUpperCase());
          found = await prisma.defectSyncOutbox.findMany({ where: { id: { in: eventIds } } });
          events = [...found].sort(
            (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
              || left.id.localeCompare(right.id)
          );
        }
      }
      throw new Error("Có quá nhiều xung đột số yêu cầu trong cùng một lô");
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Không thể lập kế hoạch ghi Sheet theo lô", 409);
    }
  });
}
