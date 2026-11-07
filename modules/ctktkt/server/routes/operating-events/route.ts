import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { getRawDb } from "@/modules/ctktkt/db";
import { EVENT_TYPES } from "@/modules/ctktkt/lib/bcsx";
import { requirePermission, requireSession } from "@/modules/ctktkt/lib/auth/server";

const units = new Set(["S1", "S2"]);
const eventTypes = new Set(EVENT_TYPES.map(t => t.code));
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const timestampPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d$/;
const unavailable = () => Response.json({ error: "Chưa truy cập được kho dữ liệu. Nội dung trên màn hình vẫn được giữ để bạn thử lưu lại." }, { status: 503 });

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!datePattern.test(date)) return Response.json({ error: "Ngày không hợp lệ." }, { status: 400 });
  try {
    const { results } = await getRawDb().prepare("SELECT id, unit, start_at AS startAt, end_at AS endAt, event_type AS eventType, description FROM operating_events WHERE operating_date = ? ORDER BY start_at").bind(date).all();
    return Response.json({ events: results }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

// Replaces the full event list for (date, unit) — simplest model for a short daily log edited by one person.
export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 200_000) return Response.json({ error: "Dữ liệu gửi lên quá lớn." }, { status: 413 });
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
    const db = getRawDb();
    const statements = [
      db.prepare("DELETE FROM operating_events WHERE operating_date = ? AND unit = ?").bind(body.date, body.unit),
      ...clean.map(e => db.prepare("INSERT INTO operating_events (operating_date, unit, start_at, end_at, event_type, description, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").bind(body.date, body.unit, e.startAt, e.endAt, e.eventType, e.description)),
    ];
    await db.batch(statements);
    return Response.json({ saved: clean.length });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
