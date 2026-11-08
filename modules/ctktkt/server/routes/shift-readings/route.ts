import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { getRawDb } from "@/modules/ctktkt/db";
import { SHIFT_METRICS, SHIFT_TIME_SLOTS } from "@/modules/ctktkt/lib/bcsx";
import { requirePermission, requireSession } from "@/modules/ctktkt/lib/auth/server";

const units = new Set(["S1", "S2"]);
const metrics = new Set(SHIFT_METRICS.map(m => m.key));
const slots = new Set(SHIFT_TIME_SLOTS);
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const unavailable = () => fail("Chưa truy cập được kho dữ liệu. Nội dung trên màn hình vẫn được giữ để bạn thử lưu lại.", 503);

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!datePattern.test(date)) return fail("Ngày không hợp lệ.", 400);
  try {
    const { results } = await getRawDb().prepare("SELECT unit, time_slot AS timeSlot, metric, value FROM shift_readings WHERE operating_date = ?").bind(date).all();
    return ok({ entries: results });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try {
    const raw = await request.text();
    if (raw.length > 300_000) return fail("Dữ liệu gửi lên quá lớn.", 413);
    const body = JSON.parse(raw) as { date?: unknown; entries?: unknown };
    if (typeof body.date !== "string" || !datePattern.test(body.date) || !Array.isArray(body.entries) || body.entries.length > 400) throw new Error("Dữ liệu không hợp lệ.");
    const clean = body.entries.map(item => {
      if (!item || typeof item !== "object") throw new Error("Một ô dữ liệu không hợp lệ.");
      const e = item as Record<string, unknown>;
      const unit = String(e.unit || ""), timeSlot = String(e.timeSlot || ""), metric = String(e.metric || ""), value = String(e.value ?? "").trim();
      if (!units.has(unit) || !slots.has(timeSlot) || !metrics.has(metric as never)) throw new Error("Tổ máy, mốc giờ hoặc thông số không hợp lệ.");
      if (value !== "" && !/^-?\d+(?:[.,]\d+)?$/.test(value)) throw new Error(`Giá trị tại ${timeSlot} phải là số.`);
      if (value.length > 40) throw new Error("Giá trị quá dài.");
      return { unit, timeSlot, metric, value: value.replace(",", ".") };
    });
    const db = getRawDb();
    const statements = clean.map(e => e.value === ""
      ? db.prepare("DELETE FROM shift_readings WHERE operating_date = ? AND unit = ? AND time_slot = ? AND metric = ?").bind(body.date, e.unit, e.timeSlot, e.metric)
      : db.prepare("INSERT INTO shift_readings (operating_date, unit, time_slot, metric, value, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(operating_date, unit, time_slot, metric) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(body.date, e.unit, e.timeSlot, e.metric, e.value));
    if (statements.length) await db.batch(statements);
    return ok({ saved: clean.length });
  } catch (error) {
    return fail(error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ.", 400);
  }
}
