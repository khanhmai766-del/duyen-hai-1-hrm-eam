"use client";
import { useDailyInputsRange, useInvalidateKtkt, useSaveDailyInputs } from "@/hooks/useKtktDailyInputs";

import { pmisShutdownEntries } from '@/modules/ctktkt/lib/pmis-shutdown-sync';
import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PmisTrendPanels } from "@/modules/ctktkt/components/pmis-trend-panels";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import { decodeQlktSyncHash, normalizeQlktValue, qlktFieldLabels, validateQlktSyncPayload, type QlktSyncPayload } from "@/modules/ctktkt/lib/qlkt-sync";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { hasPermission } from "@/modules/ctktkt/lib/auth/session";
import { addDaysIso, defaultOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import {reportPage} from "@/modules/ctktkt/lib/report-loading";
import {ReportTablePager} from "@/modules/ctktkt/components/report-table-pager";
import { GoogleMirrorLinks } from "@/modules/ctktkt/components/google-mirror-links";

type Unit = "s1" | "s2";

// 5 chỉ tiêu của báo cáo "THEO PMIS" lấy từ QLKT, tách theo tổ máy S1/S2. 4 chỉ tiêu đầu là số liệu
// mới (đồng bộ trực tiếp từ màn hình "Tính toán hiệu suất lò/suất hao nhiệt" của QLKT, lưu vào các
// mã DA–DH trong kho dữ liệu chung); riêng "Suất tiêu hao NH3 đầu cực" không cần mã riêng vì đã có
// sẵn công thức BT (S1 = NH3 DCS S1 / Đầu cực S1) và BV (S2 = NH3 DCS S2 / Đầu cực S2) trong "Chỉ
// tiêu phụ" — chỉ cần lấy lại đúng công thức đó từ B, H, BQ, BR.
const METRICS: { key: string; label: string; unit: string; codes?: Record<Unit, string> }[] = [
  { key: "PG", label: "Trung bình công suất đầu cực", unit: "MW", codes: { s1: "DA", s2: "DB" } },
  { key: "L1", label: "Tổn thất khói khô trung bình", unit: "%", codes: { s1: "DC", s2: "DD" } },
  { key: "PBN", label: "Trung bình chân không bình ngưng", unit: "kPa", codes: { s1: "DE", s2: "DF" } },
  { key: "TNM", label: "Trung bình nhiệt độ nước làm mát tuần hoàn", unit: "°C", codes: { s1: "DG", s2: "DH" } },
  { key: "NH3", label: "Suất tiêu hao NH3 đầu cực MF", unit: "g/kWh" },
];
const UNIT_LABEL: Record<Unit, string> = { s1: "S1-DH1", s2: "S2-DH1" };
// Cột nhãn chỉ tiêu đứng yên bên trái (sticky) khi cuộn ngang; độ rộng cố định để tính minWidth của
// bảng (LABEL_COL_PX) khớp với LABEL_COL.
const LABEL_COL = "w-[150px] min-w-[150px]";
const LABEL_COL_PX = 150;
const HEADER_ROW_H = "h-7";
const BAND_ROW_H = "h-6";
const METRIC_ROW_H = "h-8";

const numberFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const format = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : numberFormat.format(value);
const numberValue = (value?: string) => { if (!value?.trim()) return null; const n = Number(value.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const safeDivide = (a: number | null, b: number | null) => a === null || b === null || b === 0 ? null : a / b;
const ddMM = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const formatInputValue = (value?: string) => { const parsed = numberValue(value); return parsed === null ? (value || "") : format(parsed); };

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length <= 62) { dates.push(cursor); cursor = addDaysIso(cursor, 1); }
  return dates;
}

export function PmisReport() {
  const user = useSessionUser();
  const isViewer = !hasPermission(user, "edit_pmis");
  const today = useMemo(() => vietnamDateIso(), []);
  const defaultDate = useMemo(() => defaultOperatingDate(), []);
  const [fromDate, setFromDate] = useState(() => addDaysIso(defaultOperatingDate(), -9));
  const [toDate, setToDate] = useState(defaultDate);
  const [actionError, setError] = useState("");
  const [message, setMessage] = useState("");
  const [syncHelp, setSyncHelp] = useState(false);
  const [pendingSync, setPendingSync] = useState<QlktSyncPayload | null>(null);
  const [selectedSyncCodes, setSelectedSyncCodes] = useState<Set<string>>(new Set());
  const [syncDate, setSyncDate] = useState(defaultOperatingDate);
  const [extensionVersion, setExtensionVersion] = useState("");
  const [syncingQlkt, setSyncingQlkt] = useState(false);
  const saveSyncMutation = useSaveDailyInputs();
  const savingSync = saveSyncMutation.isPending;
  // Đồng bộ nhiều ngày lưu từng ngày một: không làm mới sau mỗi ngày, chỉ làm mới một lần ở cuối.
  const saveRangeDayMutation = useSaveDailyInputs({ invalidate: false });
  const invalidateKtkt = useInvalidateKtkt();
  const qlktRequestRef = useRef<{ id: string; timer: number } | null>(null);
  // Đồng bộ nhiều ngày liên tiếp (ví dụ lấy lại dữ liệu tháng trước): lặp qua từng ngày trong
  // khoảng đã chọn, gọi lại đúng luồng "1 ngày · 2 tổ máy" ở trên cho mỗi ngày rồi tự lưu luôn (không
  // hiện hộp thoại xác nhận cho từng ngày, vì có thể tới vài chục ngày).
  const [syncRangeFrom, setSyncRangeFrom] = useState(() => addDaysIso(defaultOperatingDate(), -9));
  const [syncRangeTo, setSyncRangeTo] = useState(defaultOperatingDate);
  const [syncingRange, setSyncingRange] = useState(false);
  const [rangeProgress, setRangeProgress] = useState("");
  // Khoảng ngày riêng cho biểu đồ, độc lập với khoảng ngày của bảng — mặc định trùng bảng, người
  // dùng có thể đổi để xem xu hướng dài/ngắn hơn mà không phải đổi cả bảng.
  const [chartFromDate, setChartFromDate] = useState(() => addDaysIso(defaultOperatingDate(), -9));
  const [chartToDate, setChartToDate] = useState(defaultDate);
  const cancelRangeRef = useRef(false);

  // Bảng và biểu đồ có thể xem hai khoảng khác nhau: luôn tải đủ ngày cho CẢ hai khoảng (gộp lại), để đổi riêng
  // 1 trong 2 khoảng không làm mất dữ liệu của khoảng còn lại. Chỉ tải lại khi bấm Áp dụng (như bản cũ).
  const [loadedRange, setLoadedRange] = useState(() => ({ from: fromDate < chartFromDate ? fromDate : chartFromDate, to: toDate > chartToDate ? toDate : chartToDate }));
  const rangeQuery = useDailyInputsRange(loadedRange.from, loadedRange.to);
  const dailyInputs = useMemo(() => rangeQuery.data ?? [], [rangeQuery.data]);
  const loading = rangeQuery.isFetching;
  const error = actionError || (rangeQuery.error instanceof Error ? rangeQuery.error.message : "");

  function reloadForBothRanges() {
    const from = fromDate < chartFromDate ? fromDate : chartFromDate;
    const to = toDate > chartToDate ? toDate : chartToDate;
    setError("");
    if (from === loadedRange.from && to === loadedRange.to) return rangeQuery.refetch();
    setLoadedRange({ from, to });
  }

  function applyManualRange() { void reloadForBothRanges(); }
  function applyChartRange() { void reloadForBothRanges(); }

  useEffect(() => {
    const payload = decodeQlktSyncHash(window.location.hash);
    if (!payload) return;
    payload.entries = [...payload.entries, ...pmisShutdownEntries(payload)];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingSync(payload);
    setSelectedSyncCodes(new Set(payload.entries.map(entry => entry.fieldCode)));
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    const channel = "ctktkt-qlkt-sync";
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { channel?: string; sender?: string; type?: string; version?: string; requestId?: string; result?: { ok?: boolean; payload?: unknown; error?: string } };
      if (!data || data.channel !== channel || data.sender !== "ctktkt-extension") return;
      if (data.type === "READY") { setExtensionVersion(String(data.version || "đã kết nối")); return; }
      if (data.type !== "SYNC_HEATRATE_RESULT" || !qlktRequestRef.current || data.requestId !== qlktRequestRef.current.id) return;
      window.clearTimeout(qlktRequestRef.current.timer); qlktRequestRef.current = null; setSyncingQlkt(false);
      if (!data.result?.ok) { setError(data.result?.error || "Chưa đồng bộ được dữ liệu từ QLKT."); return; }
      const payload = validateQlktSyncPayload(data.result.payload);
      if (!payload) { setError("Dữ liệu tiện ích trả về không có chỉ tiêu nào của báo cáo này."); return; }
      payload.entries = [...payload.entries, ...pmisShutdownEntries(payload)];
      if (!payload.entries.length) return;
      if (payload.unavailableHeatRateUnits?.length) setMessage(`QLKT: ${payload.unavailableHeatRateUnits.map(unit => `S${unit}`).join(", ")} ngừng (không có tải tổ máy); số liệu cũ của tổ ngừng sẽ được bỏ khi lưu các ô đã chọn.`);
      setPendingSync(payload); setSelectedSyncCodes(new Set(payload.entries.map(entry => entry.fieldCode))); setError("");
    };
    window.addEventListener("message", handleMessage);
    window.postMessage({ channel, sender: "ctktkt-web", type: "PING" }, window.location.origin);
    return () => { window.removeEventListener("message", handleMessage); if (qlktRequestRef.current) window.clearTimeout(qlktRequestRef.current.timer); };
  }, []);

  function syncFromQlkt() {
    setError(""); setMessage("");
    if (!extensionVersion) { window.postMessage({ channel: "ctktkt-qlkt-sync", sender: "ctktkt-web", type: "PING" }, window.location.origin); setSyncHelp(true); setError("Web chưa kết nối với tiện ích QLKT. Hãy Reload tiện ích rồi nhấn F5 trang này."); return; }
    if (qlktRequestRef.current) window.clearTimeout(qlktRequestRef.current.timer);
    const requestId = crypto.randomUUID();
    // Đồng bộ Cân bằng nhiệt giờ đọc lần lượt cả 2 Tổ máy (tự chuyển dropdown + chờ AJAX nạp lại)
    // trong 1 lần gọi, nên cho thời gian chờ tối đa dài hơn so với đọc 1 tổ máy trước đây.
    const timer = window.setTimeout(() => { if (qlktRequestRef.current?.id !== requestId) return; qlktRequestRef.current = null; setSyncingQlkt(false); setError("QLKT phản hồi quá lâu. Hãy kiểm tra phiên đăng nhập QLKT rồi thử lại."); }, 120000);
    qlktRequestRef.current = { id: requestId, timer }; setSyncingQlkt(true);
    window.postMessage({ channel: "ctktkt-qlkt-sync", sender: "ctktkt-web", type: "SYNC_HEATRATE", requestId, operatingDate: syncDate }, window.location.origin);
  }

  // Dùng riêng cho đồng bộ nhiều ngày: gửi 1 yêu cầu SYNC_HEATRATE cho đúng 1 ngày và chờ kết quả
  // bằng Promise, độc lập với luồng qlktRequestRef/pendingSync của nút "Đồng bộ QLKT" 1 ngày ở trên
  // (mỗi yêu cầu có requestId riêng nên không đụng nhau khi cả 2 luồng cùng lắng nghe "message").
  function requestHeatRateSync(operatingDate: string, timeoutMs = 120000) {
    return new Promise<{ ok: boolean; payload?: unknown; error?: string }>(resolve => {
      const channel = "ctktkt-qlkt-sync";
      const requestId = crypto.randomUUID();
      let settled = false;
      const finish = (result: { ok: boolean; payload?: unknown; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.removeEventListener("message", handleMessage);
        resolve(result);
      };
      const handleMessage = (event: MessageEvent) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const data = event.data as { channel?: string; sender?: string; type?: string; requestId?: string; result?: { ok?: boolean; payload?: unknown; error?: string } };
        if (!data || data.channel !== channel || data.sender !== "ctktkt-extension" || data.type !== "SYNC_HEATRATE_RESULT" || data.requestId !== requestId) return;
        finish(data.result?.ok ? { ok: true, payload: data.result.payload } : { ok: false, error: data.result?.error || "Chưa đồng bộ được dữ liệu từ QLKT." });
      };
      const timer = window.setTimeout(() => finish({ ok: false, error: "QLKT phản hồi quá lâu." }), timeoutMs);
      window.addEventListener("message", handleMessage);
      window.postMessage({ channel, sender: "ctktkt-web", type: "SYNC_HEATRATE", requestId, operatingDate }, window.location.origin);
    });
  }

  function cancelRangeSync() { cancelRangeRef.current = true; setRangeProgress("Đang dừng…"); }

  async function syncRangeFromQlkt() {
    setError(""); setMessage("");
    if (!extensionVersion) { window.postMessage({ channel: "ctktkt-qlkt-sync", sender: "ctktkt-web", type: "PING" }, window.location.origin); setSyncHelp(true); setError("Web chưa kết nối với tiện ích QLKT. Hãy Reload tiện ích rồi nhấn F5 trang này."); return; }
    if (syncRangeFrom > syncRangeTo) { setError("Khoảng ngày đồng bộ không hợp lệ."); return; }
    const dateList = datesBetween(syncRangeFrom, syncRangeTo);
    if (!dateList.length) { setError("Khoảng ngày đồng bộ không hợp lệ."); return; }
    if (dateList.length > 62) { setError("Mỗi lần chỉ đồng bộ tối đa 62 ngày — hãy chia nhỏ khoảng ngày."); return; }
    cancelRangeRef.current = false;
    setSyncingRange(true);
    const saved: string[] = [];
    const stopped: { date: string; units: string[] }[] = [];
    const failed: { date: string; error: string }[] = [];
    for (let index = 0; index < dateList.length; index += 1) {
      if (cancelRangeRef.current) break;
      const date = dateList[index];
      setRangeProgress(`Đang đồng bộ ${index + 1}/${dateList.length} — ngày ${date.split("-").reverse().join("/")}…`);
      const result = await requestHeatRateSync(date);
      if (!result.ok) { failed.push({ date, error: result.error || "Lỗi không rõ." }); continue; }
      const payload = validateQlktSyncPayload(result.payload);
      if (!payload) { failed.push({ date, error: "Dữ liệu tiện ích không hợp lệ." }); continue; }
      if (payload.unavailableHeatRateUnits?.length) stopped.push({ date, units: payload.unavailableHeatRateUnits });
      payload.entries = [...payload.entries, ...pmisShutdownEntries(payload)];
      if (!payload.entries.length) continue;
      try {
        const period = payload.operatingDate.slice(0, 7);
        const entries = payload.entries.map(entry => ({ operatingDate: payload.operatingDate, fieldCode: entry.fieldCode, value: normalizeQlktValue(entry.value), note: "" }));
        await saveRangeDayMutation.mutateAsync({ period, entries });
        saved.push(date);
      } catch (caught) { failed.push({ date, error: caught instanceof Error ? caught.message : "Chưa lưu được dữ liệu." }); }
    }
    setRangeProgress(""); setSyncingRange(false);
    const cancelled = cancelRangeRef.current;
    const failedSummary = failed.length ? ` Lỗi ${failed.length} ngày: ${failed.slice(0, 5).map(item => `${item.date.split("-").reverse().join("/")} (${item.error})`).join("; ")}${failed.length > 5 ? "…" : ""}` : "";
    const stoppedSummary = stopped.length ? ` Tổ máy ngừng (không có tải): ${stopped.slice(0, 5).map(item => `${item.date.split("-").reverse().join("/")} (${item.units.map(unit => `S${unit}`).join(", ")})`).join("; ")}${stopped.length > 5 ? "…" : ""}.` : "";
    if (saved.length || stopped.length) setMessage(`Đã lưu${cancelled ? " (dừng giữa chừng)" : ""} số liệu vận hành ${saved.length}/${dateList.length} ngày vào kho dữ liệu.${stoppedSummary}${failedSummary}`);
    else setError(`Không đồng bộ được ngày nào.${failedSummary}`);
    if (saved.length) await invalidateKtkt();
  }

  async function applyQlktSync() {
    if (!pendingSync) return;
    const selected = pendingSync.entries.filter(entry => selectedSyncCodes.has(entry.fieldCode));
    if (!selected.length) { setPendingSync(null); return; }
    setError("");
    try {
      const period = pendingSync.operatingDate.slice(0, 7);
      const entries = selected.map(entry => ({ operatingDate: pendingSync.operatingDate, fieldCode: entry.fieldCode, value: normalizeQlktValue(entry.value), note: "" }));
      const body = await saveSyncMutation.mutateAsync({ period, entries });
      setPendingSync(null);
      const stoppedNote = pendingSync.unavailableHeatRateUnits?.length ? ` ${pendingSync.unavailableHeatRateUnits.map(unit => `S${unit}`).join(", ")} ngừng (không có tải tổ máy).` : "";
      // Bảng tự làm mới qua invalidateQueries của lượt lưu.
      setMessage(`Đã lưu ${body.saved ?? selected.length} số liệu QLKT vào ngày ${pendingSync.operatingDate.split("-").reverse().join("/")}.${stoppedNote}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chưa lưu được dữ liệu."); }
  }

  const dataByDate = useMemo(() => {
    const grouped = new Map<string, Record<string, string>>();
    for (const entry of dailyInputs) grouped.set(entry.operatingDate, { ...(grouped.get(entry.operatingDate) || {}), [entry.fieldCode]: entry.value });
    return grouped;
  }, [dailyInputs]);

  const dates = useMemo(() => datesBetween(fromDate, toDate), [fromDate, toDate]);
  const chartDates = useMemo(() => datesBetween(chartFromDate, chartToDate), [chartFromDate, chartToDate]);

  function valueFor(unit: Unit, metric: typeof METRICS[number], date: string) {
    const values = dataByDate.get(date) || {};
    const n = (code: string) => numberValue(values[code]);
    if (metric.key === "NH3") return unit === "s1" ? safeDivide(n("BQ"), n("B")) : safeDivide(n("BR"), n("H"));
    return n(metric.codes![unit]);
  }

  return <section className="module-report flex min-h-[calc(100vh-88px)] flex-col gap-3">
    {/* Nút Google Sheets nằm bên phải khối tiêu đề (thay khung xanh riêng phía trên). */}
    <div className="module-heading-copy flex flex-wrap items-center justify-between gap-3 !px-[18px] !py-[13px] max-md:!p-3.5">
      <div className="min-w-0"><p className="module-eyebrow">Phân tích hiệu suất · S1 / S2</p><h1 className="text-xl font-extrabold uppercase tracking-tight text-[#18233d]">Bảng thông số tổn thất khói</h1></div>
      <div className="flex shrink-0 items-center print:hidden"><GoogleMirrorLinks module="pmis" variant="inline" /></div>
    </div>

    {/* Cả 2 nhóm điều khiển (xem báo cáo + đồng bộ nhiều ngày) gộp vào đúng 1 hàng trên cùng để
        nhường tối đa chiều cao còn lại cho bảng và biểu đồ bên dưới. */}
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl border border-slate-200 border-l-[3px] border-l-[color:var(--module-accent)] bg-white px-[14px] py-3 shadow-sm max-md:[&>label]:flex-[1_1_128px] max-md:[&>label>button]:w-full">
      <label className="grid gap-0.5 text-[10px] font-bold text-slate-600">TỪ NGÀY<DateField value={fromDate} max={toDate} onChange={setFromDate} className="h-8 w-[128px]"/></label>
      <label className="grid gap-0.5 text-[10px] font-bold text-slate-600">ĐẾN NGÀY<DateField value={toDate} min={fromDate} max={today} onChange={setToDate} className="h-8 w-[128px]"/></label>
      <button type="button" onClick={applyManualRange} className="h-8 rounded-xl border border-[#aebfe1] bg-[#eef3ff] px-3 text-xs font-bold text-[#354a9f]">Áp dụng</button>
      <label className="grid gap-0.5 text-[10px] font-bold text-slate-600">NGÀY ĐỒNG BỘ<DateField value={syncDate} onChange={setSyncDate} className="h-8 w-[128px]"/></label>
      <button type="button" disabled={syncingQlkt || isViewer} onClick={syncFromQlkt} className="h-8 rounded-xl bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-3 text-xs font-bold text-white shadow-md disabled:opacity-50">
        {syncingQlkt ? "Đang đồng bộ…" : "Đồng bộ ngày"}
      </button>
      <div className="h-7 w-px bg-slate-200"/>
      <label className="grid gap-0.5 text-[10px] font-bold text-slate-600">ĐỒNG BỘ TỪ<DateField value={syncRangeFrom} max={syncRangeTo} onChange={setSyncRangeFrom} className="h-8 w-[128px]"/></label>
      <label className="grid gap-0.5 text-[10px] font-bold text-slate-600">ĐẾN<DateField value={syncRangeTo} min={syncRangeFrom} max={today} onChange={setSyncRangeTo} className="h-8 w-[128px]"/></label>
      {syncingRange ? <button type="button" onClick={cancelRangeSync} className="h-8 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-bold text-red-700">Dừng</button>
        : <button type="button" disabled={syncingQlkt || isViewer} title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined} onClick={() => void syncRangeFromQlkt()} className="h-8 rounded-xl bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-3 text-xs font-bold text-white shadow-md disabled:cursor-wait disabled:opacity-60">Đồng bộ khoảng ngày</button>}
      <p className="max-w-[220px] text-[10px] font-semibold text-slate-500">{rangeProgress || "Tự lưu thẳng, không hỏi lại — tối đa 62 ngày/lần."}</p>
      <p className={`text-[10px] font-semibold ${extensionVersion ? "text-emerald-700" : "text-amber-700"}`}>{extensionVersion ? `Tiện ích v${extensionVersion} đã kết nối` : "Chưa kết nối tiện ích"}</p>
      <p className="ml-auto text-[11px] font-semibold text-slate-500">{loading ? "Đang tải…" : `${dates.length} ngày`}</p>
    </div>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900">{message}</p>}

    <PmisPagedTable key={`${fromDate}:${toDate}`} dates={dates} valueFor={valueFor}/>

    <div className="flex-wrap gap-4 [align-items:end] rounded-xl border border-[#e2e7ef] [display:flex] bg-white px-5 py-[18px] max-md:gap-3 max-md:p-4 [&>label]:grid [&>label]:gap-1.5 [&>label]:[font-size:10px] [&>label]:font-semibold [&>label]:text-[#64748b] max-md:[&>label]:flex-1">
      <div className="mr-auto max-md:w-full"><h2 className="m-0 text-[15px] font-[650] text-[#24334c]">Xu hướng chỉ tiêu PMIS</h2><p className="mx-0 mb-0 mt-[5px] text-[#768399] [font-size:11px]">Đối chiếu từng chỉ tiêu giữa hai tổ máy</p></div>
      <label>TỪ NGÀY<DateField value={chartFromDate} max={chartToDate} onChange={setChartFromDate} className="h-10 w-[150px]"/></label>
      <label>ĐẾN NGÀY<DateField value={chartToDate} min={chartFromDate} max={today} onChange={setChartToDate} className="h-10 w-[150px]"/></label>
      <button type="button" onClick={applyChartRange} className="!min-h-[38px] bg-[#245cdb] px-[18px] py-0 text-[12px] font-semibold text-white [border-radius:7px] [border:0]">Áp dụng</button>
      <span className="border-l border-l-[#e2e7ef] py-2 pl-4 pr-0 text-[12px] text-[#52627a] max-md:p-0 max-md:[border:0]">{chartDates.length} ngày</span>
    </div>

    <PmisCharts dates={chartDates} valueFor={valueFor}/>

    <DialogPrimitive.Root open={syncHelp} onOpenChange={setSyncHelp}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Đồng bộ dữ liệu QLKT</DialogPrimitive.Title><DialogPrimitive.Description className="text-sm leading-6 text-slate-600">Mở màn hình &quot;Tính toán hiệu suất lò/suất hao nhiệt&quot; trên QLKT, chọn đúng tổ máy và ngày cần lấy, rồi nhấn &quot;Đồng bộ QLKT&quot; trên trang này (hoặc dùng nút &quot;Đồng bộ trang hiện tại&quot; trong tiện ích).</DialogPrimitive.Description><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-[#274f78]"><p className="font-bold">Tiện ích không đọc hoặc lưu mật khẩu.</p><p className="mt-1">Dữ liệu luôn quay về bảng kiểm tra trước và chỉ được lưu khi bạn xác nhận.</p></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setSyncHelp(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Đóng</button><a href="/ctktkt/qlkt-sync-extension.zip" download className="rounded-lg bg-[#334785] px-4 py-2 text-sm font-semibold text-white">Tải tiện ích mới</a></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>

    <DialogPrimitive.Root open={Boolean(pendingSync)} onOpenChange={open => { if (!open) setPendingSync(null); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[86vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"><div><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Kiểm tra dữ liệu từ QLKT</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-slate-600">Ngày {pendingSync ? pendingSync.operatingDate.split("-").reverse().join("/") : ""}. Bỏ chọn chỉ tiêu chưa muốn cập nhật.</DialogPrimitive.Description></div><div className="overflow-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead><tr className="bg-[#dcebf5] text-[#173b64]"><th className="w-10 p-2 text-center">Chọn</th><th className="p-2 text-left">Chỉ tiêu</th><th className="p-2 text-center">Từ QLKT</th></tr></thead><tbody>{pendingSync?.entries.map(entry => <tr key={entry.fieldCode} className="border-t"><td className="p-2 text-center"><input type="checkbox" checked={selectedSyncCodes.has(entry.fieldCode)} onChange={event => setSelectedSyncCodes(old => { const next = new Set(old); if (event.target.checked) next.add(entry.fieldCode); else next.delete(entry.fieldCode); return next; })} aria-label={`Chọn ${qlktFieldLabels[entry.fieldCode]}`}/></td><td className="p-2"><p className="font-semibold text-black">{qlktFieldLabels[entry.fieldCode] || entry.fieldCode}</p><p className="text-xs text-slate-500">{entry.sourceLabel}</p></td><td className="p-2 text-center font-bold tabular-nums text-[#173b64]">{entry.value === "" ? "Không áp dụng — bỏ số cũ" : formatInputValue(entry.value)}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Bấm &quot;Lưu vào kho dữ liệu&quot; để ghi ngay các chỉ tiêu đã chọn.</p><div className="flex gap-2"><button type="button" onClick={() => setPendingSync(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Hủy</button><button type="button" disabled={savingSync || selectedSyncCodes.size === 0 || isViewer} title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined} onClick={() => void applyQlktSync()} className="rounded-lg bg-[#334785] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingSync ? "Đang lưu…" : "Lưu vào kho dữ liệu"}</button></div></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
  </section>;
}

type ValueFor = (unit: Unit, metric: typeof METRICS[number], date: string) => number | null;

function PmisPagedTable({dates,valueFor}:{dates:string[];valueFor:ValueFor}){
  const [page,setPage]=useState(0);
  const visible=reportPage(dates,page);
  return <div className="grid gap-2"><PmisTable dates={visible.items} valueFor={valueFor}/><ReportTablePager {...visible} onChange={setPage}/></div>;
}

// 1 bảng duy nhất, cuộn ngang khi nhiều ngày (đã bỏ kiểu đóng băng 5 ngày đầu trước đây theo yêu
// cầu) — cột nhãn chỉ tiêu vẫn đứng yên bên trái nhờ `sticky left-0` (không cần tách 2 <table>/2
// bảng riêng như trước, nên không còn phải lo lệch hàng giữa 2 bảng).
function PmisTable({ dates, valueFor }: { dates: string[]; valueFor: ValueFor }) {
  if (!dates.length) return <div className="grid min-h-40 place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Chưa chọn khoảng ngày hợp lệ.</div>;
  const dateColClass = `${HEADER_ROW_H} min-w-14 border !border-[#367c91] bg-[#23677d] px-1.5 text-center align-middle text-[11px] font-extrabold text-white`;
  return <div className="module-table-scroll shrink-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
    <table className="w-full border-collapse text-xs" style={{ minWidth: `${LABEL_COL_PX + Math.max(dates.length, 12) * 56}px` }}>
      <thead><tr>
        <th className={`${HEADER_ROW_H} ${LABEL_COL} sticky left-0 z-10 border border-[#1d3f7a] bg-[#1d3f7a] px-1.5 text-left align-middle text-xs font-extrabold text-white`}>THEO PMIS</th>
        {dates.map(date => <th key={date} className={dateColClass}>{ddMM(date)}</th>)}
      </tr></thead>
      <tbody>
        {(["s1", "s2"] as Unit[]).map(unit => <PmisUnitRows key={unit} unit={unit} dates={dates} valueFor={valueFor} withLabel/>)}
      </tbody>
    </table>
  </div>;
}

function PmisUnitRows({ unit, dates, valueFor, withLabel }: { unit: Unit; dates: string[]; valueFor: ValueFor; withLabel: boolean }) {
  return <>
    <tr><td colSpan={dates.length + (withLabel ? 1 : 0)} className={`${BAND_ROW_H} border !border-[#c6dde5] bg-[#e4f0f4] px-2 align-middle text-xs font-extrabold text-[#20465c]`}>{withLabel ? UNIT_LABEL[unit] : " "}</td></tr>
    {METRICS.map(metric => {
      const label = metric.label + (metric.unit ? ` (${metric.unit})` : "");
      return <tr key={metric.key}>
        {withLabel && <td title={label} className={`${METRIC_ROW_H} ${LABEL_COL} sticky left-0 z-10 truncate border !border-[#d7e3ef] bg-[#f0f6fa] px-2 align-middle text-left text-[11px] font-extrabold italic text-[#24425e]`}>{label}</td>}
        {dates.map(date => <td key={date} className={`${METRIC_ROW_H} min-w-14 border border-slate-200 px-1.5 align-middle text-center tabular-nums text-black`}>{format(valueFor(unit, metric, date))}</td>)}
      </tr>;
    })}
  </>;
}

function PmisCharts({ dates, valueFor }: { dates: string[]; valueFor: ValueFor }) {
  if (!dates.length) return null;
  const series = (["s1", "s2"] as Unit[]).map(unit => ({
    unit,
    points: dates.map(date => ({date, values: Object.fromEntries(METRICS.map(metric => [metric.key, valueFor(unit, metric, date)]))})),
  }));
  return <PmisTrendPanels metrics={METRICS} series={series}/>;
}
