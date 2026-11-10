import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { buildQlktOperationWorkbook, derivePreviousCompletedPowerMw, parseOperationCommandWorkbook, qlktOperationFileName } from "@/modules/ctktkt/lib/bcsx-operation-import";
import { previousIsoDate } from "@/modules/ctktkt/lib/ctktkt-report";
import { rethrowKtktServerFault } from "@/modules/ctktkt/server/server-fault";

const maxFileBytes = 4 * 1024 * 1024;
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx");
  if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return fail("Hãy gửi file Excel DanhSachLenhKetThuc.", 415);

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const operatingDate = String(formData.get("date") || "");
    if (!(file instanceof File)) throw new Error("Chưa chọn file DanhSachLenhKetThuc.");
    if (!datePattern.test(operatingDate)) throw new Error("Ngày nhập liệu không hợp lệ.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Chỉ chấp nhận file .xlsx.");
    if (file.size <= 0 || file.size > maxFileBytes) throw new Error("File rỗng hoặc vượt quá 4 MB.");

    // Sự kiện ngày trước, mới nhất trước (= ORDER BY COALESCE(NULLIF(end_at, ''), start_at) DESC, id DESC).
    const previousRows = await prisma.ctktktOperatingEvents.findMany({
      where: { operating_date: previousIsoDate(operatingDate) }, select: { id: true, unit: true, description: true, start_at: true, end_at: true },
    });
    const finishedAt = (row: { start_at: string; end_at: string }) => row.end_at || row.start_at;
    previousRows.sort((a, b) => finishedAt(a) < finishedAt(b) ? 1 : finishedAt(a) > finishedAt(b) ? -1 : b.id - a.id);
    const previousCompletedPowerMw = derivePreviousCompletedPowerMw(previousRows.map(row => ({ unit: row.unit, description: row.description })));
    const importResult = await parseOperationCommandWorkbook(await file.arrayBuffer(), file.name, operatingDate, previousCompletedPowerMw);
    const output = await buildQlktOperationWorkbook(importResult);
    // Tổ máy có lệnh trong file: thay toàn bộ sự kiện ngày đó; tổ máy không có lệnh: giữ nguyên. Một giao dịch.
    const units = (["S1", "S2"] as const).filter(unit => importResult.events[unit].length);
    if (units.length) {
      await ktktWrite(operationalWriteKeysFor("operating_events", [operatingDate]), async tx => {
        for (const unit of units) {
          await tx.ctktktOperatingEvents.deleteMany({ where: { operating_date: operatingDate, unit } });
          for (const event of importResult.events[unit]) {
            await tx.ctktktOperatingEvents.create({ data: { operating_date: operatingDate, unit, start_at: event.startAt, end_at: event.endAt, event_type: event.eventType, description: event.description } });
          }
        }
      });
    }

    const fileName = qlktOperationFileName(operatingDate);
    return new Response(output, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="' + fileName + '"',
        "Cache-Control": "no-store",
        "X-BCSX-S1-Events": String(importResult.events.S1.length),
        "X-BCSX-S2-Events": String(importResult.events.S2.length),
        "X-BCSX-S1-Preserved": String(importResult.events.S1.length === 0),
        "X-BCSX-S2-Preserved": String(importResult.events.S2.length === 0),
        "X-BCSX-Ignored-Rows": String(importResult.ignoredRows),
      },
    });
  } catch (error) {
    rethrowKtktServerFault(error);
    return fail(error instanceof Error ? error.message : "Không nhập được file lệnh điều độ.", 400);
  }
}
