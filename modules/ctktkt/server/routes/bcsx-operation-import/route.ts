import { getRawDb } from "@/modules/ctktkt/db";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { buildQlktOperationWorkbook, derivePreviousCompletedPowerMw, parseOperationCommandWorkbook, qlktOperationFileName } from "@/modules/ctktkt/lib/bcsx-operation-import";
import { previousIsoDate } from "@/modules/ctktkt/lib/ctktkt-report";

const maxFileBytes = 4 * 1024 * 1024;
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx");
  if (!guard.ok) return guard.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return Response.json({ error: "Hãy gửi file Excel DanhSachLenhKetThuc." }, { status: 415 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const operatingDate = String(formData.get("date") || "");
    if (!(file instanceof File)) throw new Error("Chưa chọn file DanhSachLenhKetThuc.");
    if (!datePattern.test(operatingDate)) throw new Error("Ngày nhập liệu không hợp lệ.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Chỉ chấp nhận file .xlsx.");
    if (file.size <= 0 || file.size > maxFileBytes) throw new Error("File rỗng hoặc vượt quá 4 MB.");

    const db = getRawDb();
    const previousEvents = await db.prepare(
      "SELECT unit, description FROM operating_events WHERE operating_date = ? ORDER BY COALESCE(NULLIF(end_at, ''), start_at) DESC, id DESC",
    ).bind(previousIsoDate(operatingDate)).all();
    const previousCompletedPowerMw = derivePreviousCompletedPowerMw(previousEvents.results);
    const importResult = await parseOperationCommandWorkbook(await file.arrayBuffer(), file.name, operatingDate, previousCompletedPowerMw);
    const output = await buildQlktOperationWorkbook(importResult);
    await db.batch([
      ...(importResult.events.S1.length ? [
        db.prepare("DELETE FROM operating_events WHERE operating_date = ? AND unit = 'S1'").bind(operatingDate),
        ...importResult.events.S1.map(event => db.prepare("INSERT INTO operating_events (operating_date, unit, start_at, end_at, event_type, description, updated_at) VALUES (?, 'S1', ?, ?, ?, ?, CURRENT_TIMESTAMP)").bind(operatingDate, event.startAt, event.endAt, event.eventType, event.description)),
      ] : []),
      ...(importResult.events.S2.length ? [
        db.prepare("DELETE FROM operating_events WHERE operating_date = ? AND unit = 'S2'").bind(operatingDate),
        ...importResult.events.S2.map(event => db.prepare("INSERT INTO operating_events (operating_date, unit, start_at, end_at, event_type, description, updated_at) VALUES (?, 'S2', ?, ?, ?, ?, CURRENT_TIMESTAMP)").bind(operatingDate, event.startAt, event.endAt, event.eventType, event.description)),
      ] : []),
    ]);

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
    return Response.json({ error: error instanceof Error ? error.message : "Không nhập được file lệnh điều độ." }, { status: 400 });
  }
}
