import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
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
import { rethrowKtktServerFault } from "@/modules/ctktkt/server/server-fault";

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
  let response: Response;
  try { response = await fetch(target, { ...init, redirect: "follow", cache: "no-store" }); }
  catch { throw new Error("Không kết nối được Google Apps Script. Thử lại sau ít phút."); }
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
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);

  let diagnosticDate = "";
  let diagnosticAction = "";
  try {
    const raw = await request.text();
    if (raw.length > 10_000) return fail("Yêu cầu quá lớn.", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const operatingDate = String(body.operatingDate || "");
    const action = String(body.action || "preview");
    diagnosticDate = operatingDate;
    diagnosticAction = action;
    if (action !== "preview" && action !== "sync") throw new Error("Thao tác đồng bộ không hợp lệ.");
    if (!datePattern.test(operatingDate)) throw new Error("Ngày đồng bộ không hợp lệ.");

    const previousDate = previousIsoDate(operatingDate);
    const [dailyRows, ppaRow, ctktktRows] = await Promise.all([
      prisma.ctktktDailyInputs.findMany({ where: { operating_date: operatingDate }, orderBy: { field_code: "asc" }, select: { field_code: true, value: true } }),
      prisma.ctktktPpaHeatRateDaily.findUnique({ where: { operating_date: operatingDate }, select: { ppa_plant: true, ppa_s1: true, ppa_s2: true, note_s1: true, note_s2: true } }),
      prisma.ctktktDailyInputs.findMany({
        where: { operating_date: { in: [previousDate, operatingDate] }, field_code: { startsWith: "KTKT:" } },
        orderBy: [{ operating_date: "asc" }, { field_code: "asc" }], select: { operating_date: true, field_code: true, value: true },
      }),
    ]);
    const ctktktByDate = new Map<string, CtktktDayEntries>();
    for (const entry of ctktktRows) {
      // Ô Chỉ tiêu KTKT lưu dạng "KTKT:<ô>" (= substr(field_code, 6) của SQL cũ).
      const values = ctktktByDate.get(entry.operating_date) || {};
      values[entry.field_code.slice(5)] = entry.value;
      ctktktByDate.set(entry.operating_date, values);
    }
    const ppaResult = ppaRow ? { ppaPlant: ppaRow.ppa_plant, ppaS1: ppaRow.ppa_s1, ppaS2: ppaRow.ppa_s2, noteS1: ppaRow.note_s1, noteS2: ppaRow.note_s2 } : null;
    const dailyEntries = mergeCtktktLinkedDailyEntries(
      dailyRows.map(row => ({ fieldCode: row.field_code, value: row.value })) as unknown as DailyInputEntry[],
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
        return fail("Máy chủ chưa được cấu hình Google Sheet. Hãy liên hệ quản trị viên; không nhập tài khoản Gmail hoặc mã kết nối trên máy người dùng.", 503);
      }
      return ok({ configured: false, preview });
    }

    const datesBody = await callAppsScript(config, { method: "GET" }, "dates");
    const row = resolveGoogleSheetRow(operatingDate, datesBody.rows);
    if (!row) throw new Error(`Không tìm thấy ngày ${operatingDate.split("-").reverse().join("/")} trong cột Ngày của trang DH1.`);
    const payload = { ...preview, row };
    if (action === "preview") return ok({ configured: true, preview: payload });

    const writeBody = await callAppsScript(config, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: config.token, days: [payload] }),
    });
    const results = Array.isArray(writeBody.results) ? writeBody.results : [];
    if (!confirmsGoogleSheetWrite(results, row)) {
      throw new Error(`Google Apps Script chưa xác nhận đã ghi đúng hàng ${row}.`);
    }
    return ok({ configured: true, preview: payload, results });
  } catch (error) {
    rethrowKtktServerFault(error);
    const message = error instanceof SyntaxError
        ? "Dữ liệu JSON không hợp lệ."
        : error instanceof Error ? error.message : "Không đồng bộ được Google Sheet.";
    console.error("[google-sheet-sync]", { action: diagnosticAction || "unknown", operatingDate: diagnosticDate || "unknown", message });
    return fail(message, 400);
  }
}
