import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import {saveReportWithShift,CorrectionError} from "@/modules/ctktkt/lib/report-corrections";
import { getRawDb } from "@/modules/ctktkt/db";
import { getSessionUser, requireSession } from "@/modules/ctktkt/lib/auth/server";
import { canEditOperatingDate, isFutureOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { canEditAnyCtktktField, canEditCtktktField } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { BCSX_COAL_STOCK_24H_CODE, CTKTKT_BCSX_LINKED_CELLS, CTKTKT_COAL_STOCK_24H_CELL, deriveCtktktCellsFromBcsx, type CtktktBcsxReading } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { CTKTKT_WATER_LINKED_CELLS, ctktktWaterLogFromRow, deriveCtktktCellsFromWater } from "@/modules/ctktkt/lib/ctktkt-water-link";
import { CTKTKT_INPUT_FIELDS } from "@/modules/ctktkt/lib/ctktkt-fields.generated";
import { CTKTKT_EXTRA_INPUT_FIELDS, CTKTKT_TEXT_INPUT_CELLS, normalizeCtktktInputValue } from "@/modules/ctktkt/lib/ctktkt-extra-fields";
import { applyCtktktFixedValue } from "@/modules/ctktkt/lib/ctktkt-defaults";
import { NH3_DCS_START_METER_CELLS } from "@/modules/ctktkt/lib/ctktkt-report";
import { ensureWaterSchema } from "@/modules/ctktkt/lib/water-report/schema";
import { COAL_STOCK_24H_START_CELL } from "@/modules/ctktkt/lib/coal-stock";
import { CTKTKT_OPERATING_HOURS_CELLS } from "@/modules/ctktkt/lib/ctktkt-extra-fields";
import { loadCtktktOperatingHours } from "@/modules/ctktkt/lib/ctktkt-operating-hours-db";
import { CTKTKT_OPERATION_EVENTS_CELL, normalizeCtktktOperationEvents } from "@/modules/ctktkt/lib/ctktkt-operation-events";
import { reportQueryRange } from "@/modules/ctktkt/lib/report-read-range";
import {coalEntriesMatchUnit} from "@/modules/ctktkt/lib/coal-meter-ocr";

const fieldCells = new Set<string>([
  ...CTKTKT_INPUT_FIELDS.map(field => field.cell),
  ...CTKTKT_EXTRA_INPUT_FIELDS.map(field => field.cell),
].filter(cell => !CTKTKT_BCSX_LINKED_CELLS.has(cell)
  && !CTKTKT_WATER_LINKED_CELLS.has(cell)
  && !NH3_DCS_START_METER_CELLS.has(cell)));
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  const range = reportQueryRange(params,scope!=="stored");
  if (!range || (scope !== null && !["daily-links","stored","operating-hours"].includes(scope)) || (scope==="stored"&&!params.get("date"))) return Response.json({ error: "Khoảng đọc dữ liệu không hợp lệ." }, { status: 400 });
  const { from, next } = range;
  const today = vietnamDateIso();
  try {
    const db = getRawDb();
    if(scope==="stored"){
      const {results}=await db.prepare("SELECT operating_date AS operatingDate, substr(field_code, 6) AS cell, value FROM daily_inputs WHERE operating_date >= ? AND operating_date < ? AND field_code LIKE 'KTKT:%' ORDER BY field_code").bind(from,next).all();
      return Response.json({entries:(results as Array<{operatingDate:string}>).filter(entry=>!isFutureOperatingDate(entry.operatingDate,today))},{headers:{"Cache-Control":"no-store"}});
    }
    if(scope==="operating-hours"){
      const hours=await loadCtktktOperatingHours(db,from,next);
      return Response.json({linkedEntries:hours.entries.filter(entry=>!isFutureOperatingDate(entry.operatingDate,today)),operatingHoursMissingDates:hours.missingDates.filter(date=>!isFutureOperatingDate(date,today))},{headers:{"Cache-Control":"no-store"}});
    }
    await ensureWaterSchema(db);
    const [{ results }, { results: shiftResults }, { results: waterResults }, { results: dailyLinkedResults }] = await Promise.all([
      db.prepare(
        "SELECT operating_date AS operatingDate, substr(field_code, 6) AS cell, value FROM daily_inputs WHERE operating_date >= ? AND operating_date < ? AND field_code LIKE 'KTKT:%' ORDER BY operating_date, field_code",
      ).bind(from, next).all(),
      db.prepare(
        "SELECT operating_date AS operatingDate, unit, time_slot AS timeSlot, metric, value FROM shift_readings WHERE operating_date >= ? AND operating_date < ? ORDER BY operating_date, unit, time_slot, metric",
      ).bind(from, next).all(),
      db.prepare(
        "SELECT log_date AS logDate, shift_time AS shiftTime, water_rec_s1 AS waterRecS1, water_rec_s2 AS waterRecS2, resin_water_s1_24h AS resinWaterS1_24h, resin_water_s2_24h AS resinWaterS2_24h FROM water_shift_logs WHERE log_date >= ? AND log_date < ? ORDER BY log_date, CASE shift_time WHEN '06h00' THEN 1 WHEN '14h00' THEN 2 WHEN '22h00' THEN 3 ELSE 9 END",
      ).bind(from, next).all(),
      db.prepare(
        "SELECT operating_date AS operatingDate, field_code AS cell, value FROM daily_inputs WHERE operating_date >= ? AND operating_date < ? AND field_code IN ('GRID_RECEIVE_S1', 'GRID_RECEIVE_S2', ?) ORDER BY operating_date, field_code",
      ).bind(from, next, BCSX_COAL_STOCK_24H_CODE).all(),
    ]);

    const readingsByDate = new Map<string, CtktktBcsxReading[]>();
    for (const reading of shiftResults as CtktktBcsxReading[]) {
      const date = reading.operatingDate || "";
      const list = readingsByDate.get(date) || [];
      list.push(reading);
      readingsByDate.set(date, list);
    }
    const linkedEntries: Array<{ operatingDate: string; cell: string; value: string }> = [];
    linkedEntries.push(...(dailyLinkedResults as Array<{ operatingDate: string; cell: string; value: string }>).map(entry => ({
      ...entry,
      cell: entry.cell === BCSX_COAL_STOCK_24H_CODE ? CTKTKT_COAL_STOCK_24H_CELL : entry.cell,
    })));
    const warnings: Array<{ operatingDate: string; cell: string; message: string }> = [];
    for (const [operatingDate, readings] of readingsByDate) {
      const derived = deriveCtktktCellsFromBcsx(readings);
      for (const [cell, value] of Object.entries(derived.entries)) linkedEntries.push({ operatingDate, cell, value });
      for (const warning of derived.warnings) warnings.push({ operatingDate, ...warning });
    }
    const hourCells = new Set<string>(CTKTKT_OPERATING_HOURS_CELLS);
    // Giờ lũy kế luôn cộng dồn từ QLKT; bỏ qua số nhập tay cũ nếu còn trong cơ sở dữ liệu.
    const manualEntries = (results as Array<{ operatingDate: string; cell: string; value: string }>).filter(entry =>
      !isFutureOperatingDate(entry.operatingDate, today)
      && !CTKTKT_BCSX_LINKED_CELLS.has(entry.cell)
      && !CTKTKT_WATER_LINKED_CELLS.has(entry.cell)
      && !hourCells.has(entry.cell));
    // Daily links do not consume W68:Z69. Full CTKTKT reads/exports retain annual totals.
    const operatingHours = scope === "daily-links"
      ? { entries: [], missingDates: [] }
      : await loadCtktktOperatingHours(db, from, next);
    linkedEntries.push(...operatingHours.entries.filter(entry => !isFutureOperatingDate(entry.operatingDate, today)));
    const nonEmptyManualKeys = new Set(manualEntries.filter(e => e.value !== "" && e.value !== null && e.value !== undefined).map(e => `${e.operatingDate}|${e.cell}`));
    const waterLogs = (waterResults as Record<string, unknown>[]).map(ctktktWaterLogFromRow);
    for (const operatingDate of new Set(waterLogs.map(log => log.logDate))) {
      for (const [cell, value] of Object.entries(deriveCtktktCellsFromWater(waterLogs, operatingDate))) {
        if (!nonEmptyManualKeys.has(`${operatingDate}|${cell}`) || Number(value) > 0) {
          linkedEntries.push({ operatingDate, cell, value });
        }
      }
    }
    return Response.json({
      entries: manualEntries,
      linkedEntries: linkedEntries.filter(entry => !isFutureOperatingDate(entry.operatingDate, today)),
      warnings: warnings.filter(item => !isFutureOperatingDate(item.operatingDate, today)),
      operatingHoursMissingDates: operatingHours.missingDates.filter(date => !isFutureOperatingDate(date, today)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Chưa tải được dữ liệu Chỉ tiêu KTKT." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  if (!canEditAnyCtktktField(user)) {
    return Response.json({ error: "Tài khoản của bạn không có quyền nhập liệu Chỉ tiêu KTKT." }, { status: 403 });
  }
  if (!isCtktktSameOrigin(request)) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 150_000) return Response.json({ error: "Dữ liệu gửi lên quá lớn." }, { status: 413 });
    const body = JSON.parse(raw) as { operatingDate?: unknown; entries?: unknown; coalUnit?:unknown; correctionReason?:unknown };
    if (typeof body.operatingDate !== "string" || !datePattern.test(body.operatingDate) || !Array.isArray(body.entries) || body.entries.length > 400) {
      throw new Error("Ngày hoặc danh sách ô nhập không hợp lệ.");
    }
    if (body.operatingDate > vietnamDateIso()) {
      return Response.json({ error: "Không thể nhập số liệu cho ngày trong tương lai." }, { status: 400 });
    }
    if (!body.correctionReason && !canEditOperatingDate(body.operatingDate, user.role === "admin")) {
      return Response.json({ error: "Chỉ tài khoản quản trị được chỉnh sửa ngày trước D-1; tài khoản khác chỉ được nhập ngày D hoặc D-1." }, { status: 403 });
    }
    const clean = body.entries.map(item => {
      if (!item || typeof item !== "object") throw new Error("Một ô dữ liệu không hợp lệ.");
      const entry = item as Record<string, unknown>;
      const cell = String(entry.cell || "").toUpperCase();
      const isText = CTKTKT_TEXT_INPUT_CELLS.has(cell) || cell === "T181";
      const normalizedValue = normalizeCtktktInputValue(cell, applyCtktktFixedValue(cell, entry.value));
      const value = cell === CTKTKT_OPERATION_EVENTS_CELL
        ? normalizeCtktktOperationEvents(normalizedValue)
        : normalizedValue;
      if (!fieldCells.has(cell)) throw new Error(`Ô ${cell || "không rõ"} không nằm trong mẫu được phép nhập.`);
      if (cell === COAL_STOCK_24H_START_CELL && value && !String(body.operatingDate).endsWith("-01")) {
        throw new Error("Than tồn kho 24h chỉ nhập tại ngày 01; các ngày sau tự tính.");
      }
      if (cell === "STARTUP_UNIT" && value && value !== "S1" && value !== "S2") {
        throw new Error("Tổ máy sự kiện chỉ được chọn S1 hoặc S2.");
      }
      if (cell === "STARTUP_EVENT" && value && !["startup", "shutdown", "incident_oil"].includes(value)) {
        throw new Error("Loại sự kiện khởi động/ngừng không hợp lệ.");
      }
      if (["STARTUP_OIL_START_TIME", "STARTUP_GRID_SYNC_TIME", "STARTUP_MIN_LOAD_TIME"].includes(cell) && value && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        throw new Error(`Ô ${cell} phải nhập thời gian dạng HH:mm.`);
      }
      const maxLength = cell === CTKTKT_OPERATION_EVENTS_CELL ? 25_000 : CTKTKT_TEXT_INPUT_CELLS.has(cell) ? 500 : 80;
      if (value.length > maxLength) throw new Error(`Giá trị ô ${cell} quá dài.`);
      if (value && !isText && !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Ô ${cell} phải là số.`);
      return { cell, value };
    });
    if(new Set(clean.map(entry=>entry.cell)).size!==clean.length)throw new Error("Danh sách có ô dữ liệu bị trùng. Chưa lưu số liệu.");
    if(!reportQueryRange(new URLSearchParams({period:body.operatingDate.slice(0,7),date:body.operatingDate})))throw new Error("Ngày ghi dữ liệu không tồn tại.");

    if(body.coalUnit!==undefined){
      if((body.coalUnit!=="S1"&&body.coalUnit!=="S2")||!coalEntriesMatchUnit(clean,body.coalUnit))throw new Error("Công tơ S1/S2 bị lẫn hoặc khác tổ máy đã chọn. Chưa lưu số liệu.");
    }
    // Chỉ lưu những ô mà người dùng có thẩm quyền theo cương vị / vai trò
    const authorizedEntries = clean.filter(entry => canEditCtktktField(user, entry.cell));
    if (authorizedEntries.length !== clean.length) {
      return Response.json({ error: "Bạn không có quyền sửa các ô dữ liệu đã gửi." }, { status: 403 });
    }

    if(body.correctionReason!==undefined&&typeof body.correctionReason!=="string")throw new Error("Lý do không hợp lệ.");
    return Response.json(await saveReportWithShift(user,body.operatingDate,authorizedEntries,body.correctionReason as string|undefined));
  } catch (error) {
    if(error instanceof CorrectionError)return Response.json({error:error.message},{status:error.status});
    return Response.json({ error: error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
