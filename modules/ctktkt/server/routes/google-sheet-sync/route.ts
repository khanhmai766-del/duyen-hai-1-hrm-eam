import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { getRawDb } from "@/modules/ctktkt/db";
import {
  buildGoogleSheetDayPayload,
  confirmsGoogleSheetWrite,
  mergeCtktktLinkedDailyEntries,
  resolveGoogleSheetRow,
  type DailyInputEntry,
  type StoredPpaEntry,
  validateGoogleAppsScriptUrl,
} from "@/modules/ctktkt/lib/google-sheet-sync";
import { previousIsoDate, type CtktktDayEntries } from "@/modules/ctktkt/lib/ctktkt-report";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";

const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function getServerConfig() {
  const rawUrl = process.env.GOOGLE_SHEET_APPS_SCRIPT_URL?.trim() || "";
  const token = process.env.GOOGLE_SHEET_SYNC_TOKEN?.trim() || "";
  if (!rawUrl || !token) return null;
  return { url: validateGoogleAppsScriptUrl(rawUrl), token };
}

async function callAppsScript(config: { url: string; token: string }, init?: RequestInit, query?: string) {
  const target = new URL(config.url);
  if (query) target.searchParams.set("action", query);
  const response = await fetch(target, { ...init, redirect: "follow", cache: "no-store" });
  const text = await response.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error("Apps Script trả về phản hồi không phải JSON."); }
  if (!response.ok || body.ok === false) throw new Error(String(body.error || "Apps Script không phản hồi thành công."));
  return body;
}

export async function POST(request: Request) {
  const guard = await requirePermission("sync_google_sheet");
  if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });

  let diagnosticDate = "";
  let diagnosticAction = "";
  try {
    const raw = await request.text();
    if (raw.length > 10_000) return Response.json({ error: "Yêu cầu quá lớn." }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const operatingDate = String(body.operatingDate || "");
    const action = String(body.action || "preview");
    diagnosticDate = operatingDate;
    diagnosticAction = action;
    if (action !== "preview" && action !== "sync") throw new Error("Thao tác đồng bộ không hợp lệ.");
    if (!datePattern.test(operatingDate)) throw new Error("Ngày đồng bộ không hợp lệ.");

    const db = getRawDb();
    const previousDate = previousIsoDate(operatingDate);
    const [dailyResult, ppaResult, ctktktResult] = await Promise.all([
      db.prepare("SELECT field_code AS fieldCode, value FROM daily_inputs WHERE operating_date = ? ORDER BY field_code").bind(operatingDate).all(),
      db.prepare("SELECT ppa_plant AS ppaPlant, ppa_s1 AS ppaS1, ppa_s2 AS ppaS2, note_s1 AS noteS1, note_s2 AS noteS2 FROM ppa_heat_rate_daily WHERE operating_date = ? LIMIT 1").bind(operatingDate).first(),
      db.prepare("SELECT operating_date AS operatingDate, substr(field_code, 6) AS cell, value FROM daily_inputs WHERE operating_date IN (?, ?) AND field_code LIKE 'KTKT:%' ORDER BY operating_date, field_code").bind(previousDate, operatingDate).all(),
    ]);
    const ctktktByDate = new Map<string, CtktktDayEntries>();
    for (const entry of ctktktResult.results as Array<{ operatingDate: string; cell: string; value: string }>) {
      const values = ctktktByDate.get(entry.operatingDate) || {};
      values[entry.cell] = entry.value;
      ctktktByDate.set(entry.operatingDate, values);
    }
    const dailyEntries = mergeCtktktLinkedDailyEntries(
      dailyResult.results as unknown as DailyInputEntry[],
      ctktktByDate.get(operatingDate) || {},
      ctktktByDate.get(previousDate),
    );
    const preview = buildGoogleSheetDayPayload(
      operatingDate,
      dailyEntries,
      (ppaResult || null) as StoredPpaEntry | null,
    );
    const config = getServerConfig();
    if (!config) {
      if (action === "sync") {
        return Response.json({ error: "Máy chủ chưa được cấu hình Google Sheet. Hãy liên hệ quản trị viên; không nhập tài khoản Gmail hoặc mã kết nối trên máy người dùng." }, { status: 503 });
      }
      return Response.json({ configured: false, preview }, { headers: { "Cache-Control": "no-store" } });
    }

    const datesBody = await callAppsScript(config, { method: "GET" }, "dates");
    const row = resolveGoogleSheetRow(operatingDate, datesBody.rows);
    if (!row) throw new Error(`Không tìm thấy ngày ${operatingDate.split("-").reverse().join("/")} trong cột Ngày của trang DH1.`);
    const payload = { ...preview, row };
    if (action === "preview") return Response.json({ configured: true, preview: payload }, { headers: { "Cache-Control": "no-store" } });

    const writeBody = await callAppsScript(config, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: config.token, days: [payload] }),
    });
    const results = Array.isArray(writeBody.results) ? writeBody.results : [];
    if (!confirmsGoogleSheetWrite(results, row)) {
      throw new Error(`Google Apps Script chưa xác nhận đã ghi đúng hàng ${row}.`);
    }
    return Response.json({ configured: true, preview: payload, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof SyntaxError
        ? "Dữ liệu JSON không hợp lệ."
        : error instanceof Error ? error.message : "Không đồng bộ được Google Sheet.";
    console.error("[google-sheet-sync]", { action: diagnosticAction || "unknown", operatingDate: diagnosticDate || "unknown", message });
    return Response.json({ error: message }, { status: 400 });
  }
}
