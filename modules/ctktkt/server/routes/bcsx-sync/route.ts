import { auditedDailyBatch } from "@/modules/ctktkt/lib/daily-input-audit";
import { getRawDb } from "@/modules/ctktkt/db";
import { EVENT_TYPES, validateOperatingEventDateRange, type OperatingEvent } from "@/modules/ctktkt/lib/bcsx";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { CTKTKT_LINKED_DAILY_CODES } from "@/modules/ctktkt/lib/daily-source-links";
import { isFutureOperatingDate } from "@/modules/ctktkt/lib/operating-date";

const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const timestampPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d$/;
const requiredCodes = ["B", "C", "AE", "H", "I", "AF", "AR"] as const;
const requiredCodeSet = new Set<string>(requiredCodes);
const eventTypeSet = new Set(EVENT_TYPES.map(item => item.code));

type DailyEntry = { operatingDate: string; fieldCode: string; value: string };
type SyncBody = { date?: unknown; entries?: unknown; events?: { S1?: unknown; S2?: unknown } };

function cleanEvents(value: unknown, date: string): OperatingEvent[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Danh sách sự kiện không hợp lệ.");
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Một dòng sự kiện không hợp lệ.");
    const raw = item as Record<string, unknown>;
    const startAt = String(raw.startAt || ""), endAt = String(raw.endAt || "");
    const eventType = Number(raw.eventType), description = String(raw.description || "").trim();
    if (!timestampPattern.test(startAt)) throw new Error("Thời gian bắt đầu sự kiện không hợp lệ.");
    if (endAt && !timestampPattern.test(endAt)) throw new Error("Thời gian kết thúc sự kiện không hợp lệ.");
    const dateIssue = validateOperatingEventDateRange(date, startAt, endAt);
    if (dateIssue === "start-date") throw new Error("Thời gian bắt đầu sự kiện không đúng ngày đồng bộ.");
    if (dateIssue === "end-date") throw new Error("Thời gian kết thúc sự kiện phải thuộc ngày đồng bộ hoặc ngày kế tiếp.");
    if (dateIssue === "end-before-start") throw new Error("Thời gian kết thúc sự kiện phải sau thời gian bắt đầu.");
    if (!eventTypeSet.has(eventType)) throw new Error("Loại sự kiện không hợp lệ.");
    if (description.length > 500) throw new Error("Mô tả sự kiện dài quá 500 ký tự.");
    return { startAt, endAt, eventType, description };
  });
}

function cleanEntries(value: unknown, date: string): DailyEntry[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("Danh sách số liệu tổng ngày không hợp lệ.");
  if (value.length === 0) return [];
  if (value.length !== requiredCodes.length) throw new Error("Số liệu tổng ngày BCSX chưa đủ 7 chỉ tiêu.");
  const seen = new Set<string>();
  const entries = value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Một số liệu tổng ngày không hợp lệ.");
    const raw = item as Record<string, unknown>;
    const operatingDate = String(raw.operatingDate || ""), fieldCode = String(raw.fieldCode || ""), valueText = String(raw.value ?? "").trim();
    const numericValue = Number(valueText);
    if (operatingDate !== date || !requiredCodeSet.has(fieldCode) || seen.has(fieldCode)) throw new Error("Ngày hoặc mã số liệu tổng ngày không hợp lệ.");
    if (!valueText || !Number.isFinite(numericValue) || numericValue < 0) throw new Error(`Giá trị ${fieldCode} phải là số không âm.`);
    seen.add(fieldCode);
    return { operatingDate, fieldCode, value: String(numericValue) };
  });
  if (requiredCodes.some(code => !seen.has(code))) throw new Error("Số liệu tổng ngày BCSX còn thiếu mã bắt buộc.");
  return entries;
}

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx");
  if (!guard.ok) return guard.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });

  try {
    const rawText = await request.text();
    if (rawText.length > 400_000) return Response.json({ error: "Dữ liệu đồng bộ quá lớn." }, { status: 413 });
    const body = JSON.parse(rawText) as SyncBody;
    const date = String(body.date || "");
    if (!datePattern.test(date)) throw new Error("Ngày đồng bộ không hợp lệ.");
    if (isFutureOperatingDate(date)) throw new Error("Không thể đồng bộ dữ liệu cho ngày trong tương lai.");
    const entries = cleanEntries(body.entries, date);
    const s1Events = cleanEvents(body.events?.S1, date);
    const s2Events = cleanEvents(body.events?.S2, date);

    const db = getRawDb();
    const entriesToPersist = entries.filter(entry => !CTKTKT_LINKED_DAILY_CODES.has(entry.fieldCode));
    const statements = [
      ...entriesToPersist.map(entry => db.prepare(
        "INSERT INTO daily_inputs (operating_date, field_code, value, note, updated_at) VALUES (?, ?, ?, '', CURRENT_TIMESTAMP) ON CONFLICT(operating_date, field_code) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
      ).bind(entry.operatingDate, entry.fieldCode, entry.value)),
      ...(s1Events.length ? [
        db.prepare("DELETE FROM operating_events WHERE operating_date = ? AND unit = 'S1'").bind(date),
        ...s1Events.map(event => db.prepare(
          "INSERT INTO operating_events (operating_date, unit, start_at, end_at, event_type, description, updated_at) VALUES (?, 'S1', ?, ?, ?, ?, CURRENT_TIMESTAMP)",
        ).bind(date, event.startAt, event.endAt, event.eventType, event.description)),
      ] : []),
      ...(s2Events.length ? [
        db.prepare("DELETE FROM operating_events WHERE operating_date = ? AND unit = 'S2'").bind(date),
        ...s2Events.map(event => db.prepare(
          "INSERT INTO operating_events (operating_date, unit, start_at, end_at, event_type, description, updated_at) VALUES (?, 'S2', ?, ?, ?, ?, CURRENT_TIMESTAMP)",
        ).bind(date, event.startAt, event.endAt, event.eventType, event.description)),
      ] : []),
    ];
    await auditedDailyBatch(db, guard.user, "bcsx-sync", statements);
    return Response.json({
      savedTotals: entriesToPersist.length,
      savedS1Events: s1Events.length,
      savedS2Events: s2Events.length,
      preservedS1Events: s1Events.length === 0,
      preservedS2Events: s2Events.length === 0,
    });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Không lưu được dữ liệu đồng bộ BCSX." }, { status: 400 });
  }
}
