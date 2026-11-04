import { auditedDailyBatch } from "@/modules/ctktkt/lib/daily-input-audit";
import { getRawDb } from "@/modules/ctktkt/db";
import { isFutureOperatingDate } from "@/modules/ctktkt/lib/operating-date";
import { requireAnyPermission } from "@/modules/ctktkt/lib/auth/server";
import { parseAvailableCapacity, PPA_AVAILABLE_CAPACITY_S1_CODE, PPA_AVAILABLE_CAPACITY_S2_CODE, PPA_OPERATING_EVENT_S1_CODE, PPA_OPERATING_EVENT_S2_CODE } from "@/modules/ctktkt/lib/google-sheet-sync";

const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function POST(request: Request) {
  const guard = await requireAnyPermission("edit_ppa"); if (!guard.ok) return guard.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 600_000) return Response.json({ error: "Dữ liệu gửi lên quá lớn." }, { status: 413 });
    const body = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(body.entries) || body.entries.length > 500) throw new Error("Danh sách đánh giá lịch sử không hợp lệ.");
    const seen = new Set<string>();
    const entries = body.entries.map(item => {
      if (!item || typeof item !== "object") throw new Error("Một dòng đánh giá không hợp lệ.");
      const value = item as Record<string, unknown>;
      const operatingDate = String(value.operatingDate || "");
      const noteS1 = String(value.noteS1 || "").trim(), noteS2 = String(value.noteS2 || "").trim();
      const hasEventS1 = Object.hasOwn(value, "eventS1"), hasEventS2 = Object.hasOwn(value, "eventS2");
      const eventS1 = String(value.eventS1 || "").trim(), eventS2 = String(value.eventS2 || "").trim();
      const hasAvailableCapacityS1 = Object.hasOwn(value, "availableCapacityS1Mw");
      const hasAvailableCapacityS2 = Object.hasOwn(value, "availableCapacityS2Mw");
      const availableCapacityS1Mw = hasAvailableCapacityS1 ? parseAvailableCapacity(value.availableCapacityS1Mw, "Công suất khả dụng S1") : null;
      const availableCapacityS2Mw = hasAvailableCapacityS2 ? parseAvailableCapacity(value.availableCapacityS2Mw, "Công suất khả dụng S2") : null;
      if (!datePattern.test(operatingDate) || seen.has(operatingDate)) throw new Error("Ngày đánh giá không hợp lệ hoặc bị trùng.");
      if (isFutureOperatingDate(operatingDate)) throw new Error("Không thể đánh giá hoặc lưu dữ liệu cho ngày trong tương lai.");
      if (noteS1.length > 1000 || noteS2.length > 1000) throw new Error(`Đánh giá ngày ${operatingDate} dài quá 1.000 ký tự.`);
      if (eventS1.length > 1000 || eventS2.length > 1000) throw new Error(`Tình hình vận hành ngày ${operatingDate} dài quá 1.000 ký tự.`);
      seen.add(operatingDate);
      return { operatingDate, noteS1, noteS2, hasEventS1, hasEventS2, eventS1, eventS2, hasAvailableCapacityS1, hasAvailableCapacityS2, availableCapacityS1Mw, availableCapacityS2Mw };
    });
    const db = getRawDb();
    const statements = entries.map(entry =>
      db.prepare(`
        INSERT INTO ppa_heat_rate_daily (
          operating_date, source_data, source_files,
          gross_s1_kwh, net_s1_kwh, gross_s2_kwh, net_s2_kwh,
          ppa_plant, ppa_s1, ppa_s2,
          note_s1, note_s2, updated_at
        ) VALUES (?, '{}', '[]', '0', '0', '0', '0', '0', '0', '0', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(operating_date) DO UPDATE SET
          note_s1 = excluded.note_s1,
          note_s2 = excluded.note_s2,
          updated_at = CURRENT_TIMESTAMP
      `).bind(entry.operatingDate, entry.noteS1, entry.noteS2)
    );
    const noteStatementCount = statements.length;
    for (const entry of entries) {
      const capacities = [
        [entry.hasAvailableCapacityS1, PPA_AVAILABLE_CAPACITY_S1_CODE, entry.availableCapacityS1Mw],
        [entry.hasAvailableCapacityS2, PPA_AVAILABLE_CAPACITY_S2_CODE, entry.availableCapacityS2Mw],
      ] as const;
      for (const [present, fieldCode, value] of capacities) {
        if (!present) continue;
        statements.push(value === null
          ? db.prepare("DELETE FROM daily_inputs WHERE operating_date = ? AND field_code = ?").bind(entry.operatingDate, fieldCode)
          : db.prepare("INSERT INTO daily_inputs (operating_date, field_code, value, note, updated_at) VALUES (?, ?, ?, '', CURRENT_TIMESTAMP) ON CONFLICT(operating_date, field_code) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(entry.operatingDate, fieldCode, String(value)));
      }
      const events = [
        [entry.hasEventS1, PPA_OPERATING_EVENT_S1_CODE, entry.eventS1],
        [entry.hasEventS2, PPA_OPERATING_EVENT_S2_CODE, entry.eventS2],
      ] as const;
      for (const [present, fieldCode, value] of events) {
        if (!present) continue;
        statements.push(value === ""
          ? db.prepare("DELETE FROM daily_inputs WHERE operating_date = ? AND field_code = ?").bind(entry.operatingDate, fieldCode)
          : db.prepare("INSERT INTO daily_inputs (operating_date, field_code, value, note, updated_at) VALUES (?, ?, ?, '', CURRENT_TIMESTAMP) ON CONFLICT(operating_date, field_code) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(entry.operatingDate, fieldCode, value));
      }
    }
    const results = statements.length ? await auditedDailyBatch(db, guard.user, "ppa-heat-rate/notes", statements) : [];
    const updated = results.slice(0, noteStatementCount).reduce((sum, result) => sum + Number(result.meta.changes || 0), 0);
    return Response.json({ received: entries.length, updated, skipped: entries.length - updated });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
