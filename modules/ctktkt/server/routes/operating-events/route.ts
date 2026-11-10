import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { EVENT_TYPES } from "@/modules/ctktkt/lib/bcsx";
import { requirePermission, requireSession } from "@/modules/ctktkt/lib/auth/server";
import { rethrowKtktServerFault } from "@/modules/ctktkt/server/server-fault";

const units = new Set(["S1", "S2"]);
const eventTypes = new Set(EVENT_TYPES.map(t => t.code));
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const timestampPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d$/;
const unavailable = () => fail("Chưa truy cập được kho dữ liệu. Nội dung trên màn hình vẫn được giữ để bạn thử lưu lại.", 503);

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!datePattern.test(date)) return fail("Ngày không hợp lệ.", 400);
  try {
    const rows = await prisma.ctktktOperatingEvents.findMany({
      where: { operating_date: date }, orderBy: { start_at: "asc" },
      select: { id: true, unit: true, start_at: true, end_at: true, event_type: true, description: true },
    });
    return ok({ events: rows.map(r => ({ id: r.id, unit: r.unit, startAt: r.start_at, endAt: r.end_at, eventType: r.event_type, description: r.description })) });
  } catch { return unavailable(); }
}

// Replaces the full event list for (date, unit) — simplest model for a short daily log edited by one person.
export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try {
    const raw = await request.text();
    if (raw.length > 200_000) return fail("Dữ liệu gửi lên quá lớn.", 413);
    const body = JSON.parse(raw) as { date?: unknown; unit?: unknown; events?: unknown };
    if (typeof body.date !== "string" || !datePattern.test(body.date) || typeof body.unit !== "string" || !units.has(body.unit) || !Array.isArray(body.events) || body.events.length > 200) throw new Error("Dữ liệu không hợp lệ.");
    const clean = body.events.map(item => {
      if (!item || typeof item !== "object") throw new Error("Một dòng sự kiện không hợp lệ.");
      const e = item as Record<string, unknown>;
      const startAt = String(e.startAt || ""), endAt = String(e.endAt || ""), eventType = Number(e.eventType), description = String(e.description || "").trim();
      if (!timestampPattern.test(startAt)) throw new Error("Thời gian bắt đầu không hợp lệ.");
      if (endAt && !timestampPattern.test(endAt)) throw new Error("Thời gian kết thúc không hợp lệ.");
      if (!eventTypes.has(eventType)) throw new Error("Loại sự kiện không hợp lệ.");
      if (description.length > 500) throw new Error("Mô tả sự kiện quá dài.");
      return { startAt, endAt, eventType, description };
    });
    // Thay toàn bộ danh sách sự kiện của (ngày, tổ máy) trong một giao dịch; thêm lần lượt để id tăng theo thứ tự gửi.
    const date = body.date, unit = body.unit;
    await ktktWrite(operationalWriteKeysFor("operating_events", [date]), async tx => {
      await tx.ctktktOperatingEvents.deleteMany({ where: { operating_date: date, unit } });
      for (const e of clean) {
        await tx.ctktktOperatingEvents.create({ data: { operating_date: date, unit, start_at: e.startAt, end_at: e.endAt, event_type: e.eventType, description: e.description } });
      }
    });
    return ok({ saved: clean.length });
  } catch (error) {
    rethrowKtktServerFault(error);
    return fail(error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ.", 400);
  }
}
