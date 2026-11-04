"use client";
import { useCtktktRequest } from "@/hooks/useCtktkt";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { confirmsGoogleSheetWrite, GOOGLE_SHEET_VIEW_URL, parseGoogleSheetAssessmentRows, resolveGoogleSheetRow, validateGoogleAppsScriptUrl, type GoogleSheetAssessmentEntry, type GoogleSheetDayPayload } from "@/modules/ctktkt/lib/google-sheet-sync";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { hasPermission } from "@/modules/ctktkt/lib/auth/session";

const URL_KEY = "ctktkt-google-script-url";
const TOKEN_KEY = "ctktkt-google-script-token";
type PreviewResponse = { configured?: boolean; preview?: GoogleSheetDayPayload; error?: string; results?: unknown };

export function GoogleSheetSyncButton({ operatingDate, disabled: disabledProp = false, disabledReason: disabledReasonProp = "", onImported, compact = false }: { operatingDate: string; disabled?: boolean; disabledReason?: string; onImported?: () => void | Promise<void>; compact?: boolean }) {
  const ctktktRequest = useCtktktRequest();

  const user = useSessionUser();
  const isViewer = !hasPermission(user, "sync_google_sheet");
  const disabled = disabledProp || isViewer;
  const disabledReason = isViewer ? "Tài khoản của bạn không có quyền đồng bộ Google Sheet." : disabledReasonProp;
  const [scriptUrl, setScriptUrl] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(URL_KEY) || "");
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) || "");
  const [settingsOpen, setSettingsOpen] = useState(false), [preview, setPreview] = useState<GoogleSheetDayPayload | null>(null);
  const [assessmentPreview, setAssessmentPreview] = useState<GoogleSheetAssessmentEntry[] | null>(null);
  const [pendingAction, setPendingAction] = useState<"push" | "import">("push");
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [serverConfigured, setServerConfigured] = useState(false);

  async function readSheetRow(url = scriptUrl) {
    const datesUrl = new URL(validateGoogleAppsScriptUrl(url.trim()));
    datesUrl.searchParams.set("action", "dates");
    const response = await ctktktRequest(datesUrl.toString(), { method: "GET", cache: "no-store" });
    const body = await response.json() as { ok?: boolean; error?: string; rows?: unknown };
    if (!response.ok || !body.ok) throw new Error(body.error || "Không đọc được danh sách ngày từ Google Sheet.");
    const row = resolveGoogleSheetRow(operatingDate, body.rows);
    if (!row) throw new Error(`Không tìm thấy ngày ${operatingDate.split("-").reverse().join("/")} trong cột Ngày của trang DH1.`);
    return row;
  }

  async function loadHistoricalAssessments(credentials = { url: scriptUrl, token }) {
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await ctktktRequest(validateGoogleAppsScriptUrl(credentials.url.trim()), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: credentials.token, action: "readAssessments" }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; rows?: unknown };
      if (!response.ok || body.ok === false) throw new Error(body.error || "Apps Script chưa đọc được cột Đánh giá.");
      const rows = parseGoogleSheetAssessmentRows(body.rows);
      if (!rows.length) throw new Error("Google Sheet chưa có đánh giá S1/S2 để nhập.");
      setAssessmentPreview(rows);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không đọc được đánh giá lịch sử từ Google Sheet."); }
    finally { setLoading(false); }
  }

  function startHistoricalImport() {
    setError(""); setMessage(""); setPendingAction("import");
    if (!scriptUrl.trim() || !token) { setSettingsOpen(true); return; }
    void loadHistoricalAssessments();
  }

  function saveSettings() {
    if (!scriptUrl.trim() || !token) { setError("Hãy nhập đủ URL Apps Script và mã kết nối."); return; }
    let validatedUrl: string;
    try {
      validatedUrl = validateGoogleAppsScriptUrl(scriptUrl.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "URL Apps Script không hợp lệ.");
      return;
    }
    window.localStorage.setItem(URL_KEY, validatedUrl);
    window.localStorage.setItem(TOKEN_KEY, token);
    setScriptUrl(validatedUrl);
    setSettingsOpen(false);
    if (pendingAction === "import") void loadHistoricalAssessments({ url: validatedUrl, token });
    else void pushGoogleSheet(preview, { url: validatedUrl, token });
  }

  async function importHistoricalAssessments() {
    setLoading(true); setError(""); setMessage("");
    try {
      if (!assessmentPreview?.length) throw new Error("Chưa có đánh giá lịch sử để nhập.");
      const response = await ctktktRequest("/api/ctktkt/ppa-heat-rate/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: assessmentPreview.map(item => ({ operatingDate: item.iso, noteS1: item.noteS1, noteS2: item.noteS2 })) }),
      });
      const body = await response.json() as { updated?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(body.error || "Web chưa lưu được đánh giá lịch sử.");
      setAssessmentPreview(null);
      setMessage(`Đã nhập đánh giá cho ${body.updated || 0} ngày. ${body.skipped ? `${body.skipped} ngày chưa có kết quả PPA trên web nên được bỏ qua.` : ""}`.trim());
      await onImported?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không nhập được đánh giá lịch sử."); }
    finally { setLoading(false); }
  }

  async function writeDirect(payload: GoogleSheetDayPayload, credentials = { url: scriptUrl, token }) {
    const row = await readSheetRow(credentials.url);
    const day = { ...payload, row };
    const response = await ctktktRequest(validateGoogleAppsScriptUrl(credentials.url.trim()), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: credentials.token, days: [day] }),
    });
    const body = await response.json() as { ok?: boolean; error?: string; results?: unknown };
    if (!response.ok || body.ok === false) throw new Error(body.error || "Google Apps Script không ghi được dữ liệu.");
    if (!confirmsGoogleSheetWrite(body.results, row)) throw new Error(`Google Apps Script chưa xác nhận đã ghi đúng hàng ${row}.`);
    return row;
  }

  async function pushGoogleSheet(
    fallbackPreview?: GoogleSheetDayPayload | null,
    credentials = { url: scriptUrl, token },
  ) {
    setLoading(true); setError(""); setMessage("");
    try {
      let payload = fallbackPreview || null;
      if (!payload) {
        const response = await ctktktRequest("/api/ctktkt/google-sheet-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatingDate, action: "sync" }),
        });
        const body = await response.json() as PreviewResponse;
        if (!response.ok || body.error) throw new Error(body.error || "Không đồng bộ được Google Sheet.");
        setServerConfigured(Boolean(body.configured));
        if (body.configured) {
          const row = body.preview?.row;
          if (!row || !confirmsGoogleSheetWrite(body.results, row)) throw new Error("Google Apps Script chưa xác nhận đã ghi đúng hàng cần đồng bộ.");
          setPreview(null);
          setMessage(`Đã đẩy ngày ${operatingDate.split("-").reverse().join("/")} lên hàng ${row} của trang DH1.`);
          return;
        }
        payload = body.preview || null;
      }
      if (!payload) throw new Error("Web chưa tạo được dữ liệu để gửi.");
      if (!credentials.url.trim() || !credentials.token) {
        setPreview(payload);
        setPendingAction("push");
        setSettingsOpen(true);
        return;
      }
      const row = await writeDirect(payload, credentials);
      setPreview(null);
      setMessage(`Đã đẩy ngày ${operatingDate.split("-").reverse().join("/")} lên hàng ${row} của trang DH1.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không ghi được Google Sheet."); }
    finally { setLoading(false); }
  }

  const displayDate = operatingDate.split("-").reverse().join("/");

  return <>
    <div className="google-sheet-actions flex flex-col items-end gap-1">
      <div className="google-sheet-buttons flex flex-wrap gap-1">
        <button type="button" disabled={loading || disabled} onClick={() => void pushGoogleSheet()} title={disabled ? disabledReason : `Đẩy ngay dữ liệu ngày ${displayDate} lên Google Sheet`} className="h-10 whitespace-nowrap rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 shadow-sm disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-80">{loading ? "Đang đẩy…" : compact ? "Đẩy Google Sheet" : `Đẩy Google Sheet · ${displayDate}`}</button>
        <a href={GOOGLE_SHEET_VIEW_URL} target="_blank" rel="noopener noreferrer" title="Mở bảng Google Sheet trong tab mới" className="inline-flex h-10 items-center whitespace-nowrap rounded-xl border border-blue-300 bg-blue-50 px-3 text-sm font-bold text-blue-800 shadow-sm hover:bg-blue-100">Mở Google Sheet</a>
        <button type="button" disabled={loading || disabled} onClick={startHistoricalImport} title={disabled ? disabledReason : "Nhập một lần các đánh giá S1/S2 cũ từ Google Sheet về web"} className="h-10 whitespace-nowrap rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-800 shadow-sm disabled:opacity-60">Nhập đánh giá cũ</button>
        {!serverConfigured && <button type="button" onClick={() => { setError(""); setSettingsOpen(true); }} aria-label="Cài đặt đồng bộ Google Sheet" title="Cài đặt Google Sheet dự phòng" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 shadow-sm">⚙</button>}
      </div>
      {serverConfigured && <p className="max-w-sm text-right text-[11px] font-semibold text-emerald-700">Đã ghi qua cấu hình Apps Script của chủ sở hữu trên máy chủ; máy người dùng không cần quyền chỉnh sửa Sheet.</p>}
      {disabled && disabledReason && <p className="max-w-sm text-right text-[11px] font-semibold text-amber-700">{disabledReason}</p>}
      {message && <p role="status" className="max-w-sm text-right text-[11px] font-semibold text-emerald-700">{message}</p>}
      {error && <p role="alert" className="max-w-sm text-right text-[11px] font-semibold text-red-700">{error}</p>}
    </div>

    <DialogPrimitive.Root open={settingsOpen} onOpenChange={setSettingsOpen}><DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/>
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none">
        <div><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Thiết lập Google Sheet</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-slate-600">Chỉ thiết lập một lần trên máy này. URL và mã kết nối được giữ trong trình duyệt, không ghi vào GitHub.</DialogPrimitive.Description></div>
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Apps Script URL (phải kết thúc bằng /exec)
          <input value={scriptUrl} onChange={event => setScriptUrl(event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" className="rounded-xl border border-slate-300 px-3 py-2 font-normal text-black"/>
          <span className="font-normal text-red-700">Không dán link docs.google.com/spreadsheets/... vào ô này.</span>
        </label>
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Mã kết nối
          <input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" className="rounded-xl border border-slate-300 px-3 py-2 font-normal text-black"/>
          <span className="font-normal text-slate-500">Đây là Token trong công cụ “Đồng bộ DH1”, không phải mật khẩu Google.</span>
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">{error}</p>}
        <p className="text-xs leading-5 text-slate-500">Hai giá trị chỉ được lưu trong trình duyệt của máy này và không ghi vào GitHub.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Hủy</button><button type="button" onClick={saveSettings} className="rounded-lg bg-[#334785] px-4 py-2 text-sm font-semibold text-white">Lưu và đẩy</button></div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal></DialogPrimitive.Root>

    <DialogPrimitive.Root open={Boolean(assessmentPreview)} onOpenChange={open => { if (!open && !loading) setAssessmentPreview(null); }}><DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/>
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[88vh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none">
        <div><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Nhập đánh giá lịch sử từ Google Sheet</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm leading-6 text-slate-600">Tìm thấy {assessmentPreview?.length || 0} ngày có đánh giá. Chỉ hai ghi chú S1/S2 của ngày đã có PPA trên web được cập nhật; mọi số liệu khác giữ nguyên.</DialogPrimitive.Description></div>
        <div className="overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-xs"><thead><tr className="bg-[#dcebf5] text-[#173b64]"><th className="w-28 p-2 text-left">Ngày</th><th className="p-2 text-left">Đánh giá S1</th><th className="p-2 text-left">Đánh giá S2</th></tr></thead><tbody>{assessmentPreview?.map(item => <tr key={item.iso} className="border-t align-top text-black"><td className="p-2 font-bold">{item.iso.split("-").reverse().join("/")}</td><td className="whitespace-pre-wrap p-2 leading-5">{item.noteS1 || "—"}</td><td className="whitespace-pre-wrap p-2 leading-5">{item.noteS2 || "—"}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Đây là thao tác nhập lịch sử một lần. Sau đó web là nguồn chính để đẩy dữ liệu lên Google Sheet.</p><div className="flex shrink-0 gap-2"><button type="button" disabled={loading} onClick={() => setAssessmentPreview(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Hủy</button><button type="button" disabled={loading} onClick={() => void importHistoricalAssessments()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Đang nhập…" : "Xác nhận nhập về web"}</button></div></div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal></DialogPrimitive.Root>

  </>;
}
