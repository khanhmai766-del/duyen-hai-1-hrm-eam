"use client";
import { useCtktktRequest } from "@/hooks/useCtktkt";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/modules/ctktkt/components/ui/dialog";
import { NkvhPpaSyncButton } from "@/modules/ctktkt/components/nkvh-ppa-sync-button";
import { calculateActualHeatRate, calculatePpaHeatRate, compareHeatRate, mergeMeterReadings, parseMeterCsv, selectPpaSource, type MeterReading, type PpaResult } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { decodeQlktPpaSyncHash, validateQlktPpaSyncPayload } from "@/modules/ctktkt/lib/qlkt-sync";
import { isQlktExtensionOutdated, REQUIRED_QLKT_EXTENSION_VERSION } from "@/modules/ctktkt/lib/qlkt-extension-version";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { hasPermission } from "@/modules/ctktkt/lib/auth/session";
import { defaultOperatingDate } from "@/modules/ctktkt/lib/operating-date";
import { mergeDailyInputsWithCtktkt } from "@/modules/ctktkt/lib/daily-source-links";
import { parseAvailableCapacity, PPA_AVAILABLE_CAPACITY_S1_CODE, PPA_AVAILABLE_CAPACITY_S2_CODE, PPA_OPERATING_EVENT_S1_CODE, PPA_OPERATING_EVENT_S2_CODE } from "@/modules/ctktkt/lib/google-sheet-sync";

type DailyInput = { operatingDate: string; fieldCode: string; value: string };
type CtktktInput = { operatingDate: string; cell: string; value: string };
type StoredPpa = PpaResult & { operatingDate: string; sourceFiles: string; noteS1: string; noteS2: string; updatedAt: string };

const numberFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const format = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? "—" : numberFormat.format(value);

async function readCsvFile(file: File) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("�")) {
    try { text = new TextDecoder("windows-1258").decode(buffer); } catch { /* keep UTF-8 text */ }
  }
  return text;
}

export function PpaHeatRateComparison() {
  const ctktktRequest = useCtktktRequest();

  const user = useSessionUser();
  const isViewer = !hasPermission(user, "edit_ppa");
  const [operatingDate, setOperatingDate] = useState(defaultOperatingDate), [readings, setReadings] = useState<MeterReading[]>([]), [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [pastedText, setPastedText] = useState(""), [noteS1, setNoteS1] = useState(""), [noteS2, setNoteS2] = useState("");
  const [eventS1, setEventS1] = useState(""), [eventS2, setEventS2] = useState("");
  const [availableCapacityS1Mw, setAvailableCapacityS1Mw] = useState(""), [availableCapacityS2Mw, setAvailableCapacityS2Mw] = useState("");
  const [dailyInputs, setDailyInputs] = useState<DailyInput[]>([]), [history, setHistory] = useState<StoredPpa[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [savingNotes, setSavingNotes] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [extensionVersion, setExtensionVersion] = useState(""), [syncingQlkt, setSyncingQlkt] = useState(false);
  const [stoppedUnits, setStoppedUnits] = useState<string[]>([]);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [confirmationDate, setConfirmationDate] = useState(operatingDate);
  if (confirmationDate !== operatingDate) {
    setConfirmationDate(operatingDate);
    setStoppedUnits([]);
    setStopDialogOpen(false);
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const qlktRequestRef = useRef<{ id: string; timer: number } | null>(null);
  const loadPeriodControllerRef = useRef<AbortController | null>(null);
  const period = operatingDate.slice(0, 7);

  const loadPeriod = useCallback(async () => {
    loadPeriodControllerRef.current?.abort();
    const controller = new AbortController();
    loadPeriodControllerRef.current = controller;
    setLoading(true); setError("");
    try {
      const [dailyResponse, ctktktResponse, ppaResponse] = await Promise.all([
        ctktktRequest(`/api/ctktkt/daily-inputs?period=${period}`, { cache: "no-store", signal: controller.signal }),
        ctktktRequest(`/api/ctktkt/ctktkt-report?period=${period}&scope=daily-links`, { cache: "no-store", signal: controller.signal }),
        ctktktRequest(`/api/ctktkt/ppa-heat-rate?period=${period}`, { cache: "no-store", signal: controller.signal }),
      ]);
      const dailyBody = await dailyResponse.json() as { entries?: DailyInput[]; error?: string };
      const ctktktBody = await ctktktResponse.json() as { entries?: CtktktInput[]; linkedEntries?: CtktktInput[]; error?: string };
      const ppaBody = await ppaResponse.json() as { entries?: StoredPpa[]; error?: string };
      if (!dailyResponse.ok) throw new Error(dailyBody.error || "Không tải được dữ liệu KTKT.");
      if (!ctktktResponse.ok) throw new Error(ctktktBody.error || "Không tải được dữ liệu Chỉ tiêu KTKT.");
      if (!ppaResponse.ok) throw new Error(ppaBody.error || "Không tải được lịch sử PPA.");
      if (loadPeriodControllerRef.current !== controller) return;
      setDailyInputs(mergeDailyInputsWithCtktkt(
        dailyBody.entries || [],
        [...(ctktktBody.entries || []), ...(ctktktBody.linkedEntries || [])],
        period,
      ));
      setHistory(ppaBody.entries || []);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Không tải được dữ liệu.");
    } finally {
      if (loadPeriodControllerRef.current === controller) {
        loadPeriodControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [period, ctktktRequest]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPeriod(), 0);
    return () => {
      window.clearTimeout(timer);
      loadPeriodControllerRef.current?.abort();
    };
  }, [loadPeriod]);

  // Tự động điền nhận xét đã lưu của ngày đang chọn khi đổi ngày hoặc khi history tải xong
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const existing = history.find(entry => entry.operatingDate === operatingDate);
      const dailyValue = (fieldCode: string) => dailyInputs.find(entry => entry.operatingDate === operatingDate && entry.fieldCode === fieldCode)?.value || "";
      setNoteS1(existing?.noteS1 || "");
      setNoteS2(existing?.noteS2 || "");
      setEventS1(dailyValue(PPA_OPERATING_EVENT_S1_CODE));
      setEventS2(dailyValue(PPA_OPERATING_EVENT_S2_CODE));
      setAvailableCapacityS1Mw(dailyValue(PPA_AVAILABLE_CAPACITY_S1_CODE));
      setAvailableCapacityS2Mw(dailyValue(PPA_AVAILABLE_CAPACITY_S2_CODE));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [operatingDate, history, dailyInputs]);

  useEffect(() => {
    const payload = decodeQlktPpaSyncHash(window.location.hash);
    if (!payload) return;
    const timer = window.setTimeout(() => {
      try {
        const mergedMap = mergeMeterReadings([payload.readings]);
        if (!selectPpaSource(mergedMap).source) throw new Error("Dữ liệu QLKT chưa đủ 4 điểm đo PPA.");
        setReadings([...mergedMap.values()]);
        setSourceFiles(["QLKT · Số liệu đo đếm công tơ"]);
        setOperatingDate(payload.operatingDate);
        setError("");
        setMessage(payload.missingReceiveMeters?.length
          ? `Đã nhận đủ 4 kênh giao để tính PPA. Chưa có điện nhận lưới: ${payload.missingReceiveMeters.join(", ")}; không gán bằng 0 và không dùng để cập nhật điện tự dùng.`
          : "Đã nhận 4 kênh giao PPA và 2 kênh nhận lưới × 48 chu kỳ từ QLKT. Suất hao nhiệt thực tế tự liên kết từ Chỉ tiêu KTKT.");
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Không đọc được dữ liệu công tơ từ QLKT.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const channel = "ctktkt-qlkt-sync";
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { channel?: string; sender?: string; type?: string; version?: string; requestId?: string; result?: { ok?: boolean; payload?: unknown; error?: string } };
      if (!data || data.channel !== channel || data.sender !== "ctktkt-extension") return;
      if (data.type === "READY") {
        setExtensionVersion(String(data.version || "đã kết nối"));
        return;
      }
      if (data.type !== "SYNC_PPA_RESULT" || !qlktRequestRef.current || data.requestId !== qlktRequestRef.current.id) return;
      window.clearTimeout(qlktRequestRef.current.timer);
      qlktRequestRef.current = null;
      setSyncingQlkt(false);
      if (!data.result?.ok) {
        setError(data.result?.error || "Chưa đồng bộ được dữ liệu từ QLKT.");
        return;
      }
      const payload = validateQlktPpaSyncPayload(data.result.payload);
      if (!payload) {
        setError("Dữ liệu tiện ích trả về chưa đủ kênh giao PPA hoặc chưa xác định rõ điện nhận lưới bị thiếu.");
        return;
      }
      try {
        const mergedMap = mergeMeterReadings([payload.readings]);
        if (!selectPpaSource(mergedMap).source) throw new Error("Dữ liệu QLKT chưa đủ 4 điểm đo PPA.");
        setReadings([...mergedMap.values()]);
        setSourceFiles(["QLKT · Số liệu đo đếm công tơ"]);
        setOperatingDate(payload.operatingDate);
        setError("");
        setMessage(payload.missingReceiveMeters?.length
          ? `Đồng bộ PPA thành công. Chưa có điện nhận lưới: ${payload.missingReceiveMeters.join(", ")}; không gán bằng 0 và không dùng để cập nhật điện tự dùng.`
          : "Đồng bộ QLKT thành công: đã nhận 4 kênh giao PPA và 2 kênh nhận lưới × 48 chu kỳ. Suất hao nhiệt thực tế tự liên kết từ Chỉ tiêu KTKT.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Không đọc được dữ liệu công tơ từ QLKT.");
      }
    };
    window.addEventListener("message", handleMessage);
    window.postMessage({ channel, sender: "ctktkt-web", type: "PING" }, window.location.origin);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (qlktRequestRef.current) window.clearTimeout(qlktRequestRef.current.timer);
    };
  }, []);

  const actualByDate = useMemo(() => {
    const grouped = new Map<string, Record<string, string>>();
    for (const entry of dailyInputs) grouped.set(entry.operatingDate, { ...(grouped.get(entry.operatingDate) || {}), [entry.fieldCode]: entry.value });
    return new Map([...grouped].map(([date, values]) => [date, calculateActualHeatRate(values)]));
  }, [dailyInputs]);
  const actual = actualByDate.get(operatingDate) || null;
  const selected = useMemo(() => selectPpaSource(mergeMeterReadings([readings])), [readings]);
  const calculationState = useMemo(() => {
    if (!selected.source) return { calculation: null, error: "" };
    try {
      return { calculation: calculatePpaHeatRate(selected.source, Number(operatingDate.slice(0, 4))), error: "" };
    } catch (caught) {
      return { calculation: null, error: caught instanceof Error ? caught.message : "Dữ liệu công tơ PPA không hợp lệ." };
    }
  }, [selected.source, operatingDate]);
  const calculation = calculationState.calculation;
  const selectedDailyValues = useMemo(() => Object.fromEntries(
    dailyInputs.filter(entry => entry.operatingDate === operatingDate).map(entry => [entry.fieldCode, entry.value]),
  ), [dailyInputs, operatingDate]);
  const missingActualCodes = ["C", "I", "AE", "AF", "AJ"].filter(code => !selectedDailyValues[code]?.trim());

  function addParsed(next: MeterReading[], name: string) {
    const merged = mergeMeterReadings([readings, next]);
    const dates = [...new Set([...merged.values()].map(item => item.operatingDate).filter(Boolean))];
    if (dates.length > 1) throw new Error("Các CSV đang chứa nhiều ngày khác nhau. Chỉ đưa dữ liệu của một ngày trong mỗi lần tính.");
    setReadings([...merged.values()]);
    setSourceFiles(old => old.includes(name) ? old : [...old, name]);
    if (dates.length === 1) setOperatingDate(dates[0]);
  }

  function addPastedData() {
    setError(""); setMessage("");
    try {
      if (!pastedText.trim()) throw new Error("Hãy dán nội dung CSV vào ô trước.");
      addParsed(parseMeterCsv(pastedText, `Dữ liệu dán ${sourceFiles.length + 1}`), `Dữ liệu dán ${sourceFiles.length + 1}`);
      setPastedText(""); setMessage("Đã đọc dữ liệu vừa dán. Có thể dán tiếp CSV còn lại.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không đọc được dữ liệu CSV."); }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(""); setMessage("");
    try {
      let merged = readings, names = sourceFiles;
      for (const file of [...files]) {
        const parsed = parseMeterCsv(await readCsvFile(file), file.name);
        merged = [...mergeMeterReadings([merged, parsed]).values()];
        if (!names.includes(file.name)) names = [...names, file.name];
      }
      const dates = [...new Set(merged.map(item => item.operatingDate).filter(Boolean))];
      if (dates.length > 1) throw new Error("Các CSV đang chứa nhiều ngày khác nhau. Chỉ chọn dữ liệu của một ngày trong mỗi lần tính.");
      setReadings(merged); setSourceFiles(names); if (dates.length === 1) setOperatingDate(dates[0]);
      setMessage(`Đã đọc ${files.length} file CSV.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không đọc được dữ liệu CSV."); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  function clearImport() { setReadings([]); setSourceFiles([]); setPastedText(""); setMessage(""); setError(""); }

  function syncFromQlkt() {
    setStopDialogOpen(false);
    setError(""); setMessage("");
    if (!extensionVersion) {
      window.postMessage({ channel: "ctktkt-qlkt-sync", sender: "ctktkt-web", type: "PING" }, window.location.origin);
      setError("Web chưa kết nối với tiện ích QLKT. Hãy Reload tiện ích phiên bản 0.4.6 rồi nhấn F5 trang này.");
      return;
    }
    if (qlktRequestRef.current) window.clearTimeout(qlktRequestRef.current.timer);
    if (isQlktExtensionOutdated(extensionVersion)) {
      setError(`Hãy cập nhật tiện ích QLKT ${REQUIRED_QLKT_EXTENSION_VERSION}, Reload tiện ích và Ctrl+F5 trang web để hỗ trợ tổ ngừng.`);
      return;
    }
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      if (qlktRequestRef.current?.id !== requestId) return;
      qlktRequestRef.current = null;
      setSyncingQlkt(false);
      setError("QLKT phản hồi quá lâu. Hãy kiểm tra phiên đăng nhập QLKT rồi thử lại.");
    }, 90000);
    qlktRequestRef.current = { id: requestId, timer };
    setSyncingQlkt(true);
    window.postMessage({ channel: "ctktkt-qlkt-sync", sender: "ctktkt-web", type: "SYNC_PPA", requestId, operatingDate, stoppedUnits }, window.location.origin);
  }

  async function persistDayDetails() {
    const capacityS1 = parseAvailableCapacity(availableCapacityS1Mw, "Công suất khả dụng S1");
    const capacityS2 = parseAvailableCapacity(availableCapacityS2Mw, "Công suất khả dụng S2");
    const response = await ctktktRequest("/api/ctktkt/ppa-heat-rate/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [{ operatingDate, noteS1: noteS1.trim(), noteS2: noteS2.trim(), eventS1: eventS1.trim(), eventS2: eventS2.trim(), availableCapacityS1Mw: capacityS1, availableCapacityS2Mw: capacityS2 }]
      })
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error || "Chưa lưu được thông tin tổ máy.");
  }

  async function saveNotesOnly() {
    setSavingNotes(true); setError(""); setMessage("");
    try {
      await persistDayDetails();
      setMessage(`Đã lưu công suất khả dụng, nhận xét và sự kiện S1 & S2 cho ngày ${operatingDate.split("-").reverse().join("/")}.`);
      await loadPeriod();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa lưu được nhận xét.");
    } finally {
      setSavingNotes(false);
    }
  }

  async function save() {
    if (!selected.source || !calculation) { setError("Chưa đủ 4 điểm đo bắt buộc để tính và lưu."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      parseAvailableCapacity(availableCapacityS1Mw, "Công suất khả dụng S1");
      parseAvailableCapacity(availableCapacityS2Mw, "Công suất khả dụng S2");
      const response = await ctktktRequest("/api/ctktkt/ppa-heat-rate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatingDate, source: selected.source, sourceFiles, noteS1, noteS2 }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Chưa lưu được kết quả.");
      await persistDayDetails();
      setMessage(`Đã lưu kết quả so sánh ngày ${operatingDate.split("-").reverse().join("/")}.`);
      await loadPeriod();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chưa lưu được kết quả."); }
    finally { setSaving(false); }
  }

  const comparisonRows = calculation ? [
    { label: "Chung 2 tổ", ppa: calculation.ppaPlant, actual: actual?.actualPlant ?? null },
    { label: "S1", ppa: calculation.ppaS1, actual: actual?.actualS1 ?? null },
    { label: "S2", ppa: calculation.ppaS2, actual: actual?.actualS2 ?? null },
  ] : [];

  return <section className="space-y-3">
    {/* 1. Header Toolbar nhỏ gọn */}
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-base font-extrabold tracking-tight text-[#18233d]">So sánh SHN PPA & Thực tế</h1>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${extensionVersion ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${extensionVersion ? "bg-emerald-500" : "bg-amber-500"}`} />
          {extensionVersion ? `Tiện ích v${extensionVersion}` : "Chưa kết nối tiện ích"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-600">Ngày:</span>
        <DateField value={operatingDate} onChange={value => { setOperatingDate(value); clearImport(); }} className="w-[145px]" />
        <button type="button" disabled={syncingQlkt || isViewer} onClick={() => setStopDialogOpen(true)} className="rounded-lg bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-50">
          {syncingQlkt ? "Đang lấy công tơ PPA…" : "⚡ Lấy công tơ PPA từ QLKT"}
        </button>
      </div>
    </div>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900">{message}</p>}

    <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận trước khi lấy công tơ PPA</DialogTitle>
          <DialogDescription>
            Ngày {operatingDate.split("-").reverse().join("/")}. Chọn tổ máy không phát điện suốt ngày. Nếu cả hai tổ đều phát điện, để trống và xác nhận.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {["S1", "S2"].map(unit => <label key={unit} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={stoppedUnits.includes(unit)}
              onChange={event => setStoppedUnits(previous => event.target.checked ? [...previous, unit] : previous.filter(value => value !== unit))}
              className="h-4 w-4 accent-[#4057b5]" />
            Tổ máy {unit} ngừng cả ngày
          </label>)}
        </div>
        <p className="text-xs text-slate-500">Điện nhận lưới thiếu sẽ được báo riêng, không tự gán bằng 0.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setStopDialogOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">Hủy</button>
          <button type="button" onClick={syncFromQlkt} disabled={syncingQlkt || isViewer}
            className="rounded-lg bg-[#4057b5] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Xác nhận & đồng bộ</button>
        </div>
      </DialogContent>
    </Dialog>
    {/* 2. Dải trạng thái nguồn tính tinh gọn */}
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-500">Nguồn PPA:</span>
          {calculation ? (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">✓ Đủ 4 điểm đo (48 chu kỳ)</span>
          ) : calculationState.error ? (
            <span className="rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-800">Đủ 4 điểm đo nhưng số liệu chưa hợp lệ</span>
          ) : (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              {selected.found.filter(item => item.found).length}/4 điểm đo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-500">Thực tế:</span>
          {actual ? (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">✓ Liên kết từ Chỉ tiêu KTKT</span>
          ) : (
            <span className="rounded-md bg-slate-200 px-2 py-0.5 font-semibold text-slate-600">
              {missingActualCodes.length ? `Thiếu KTKT: ${missingActualCodes.join(", ")}` : "Số liệu KTKT chưa hợp lệ"}
            </span>
          )}
        </div>
      </div>
      {calculation && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
          <span className="rounded border bg-white px-1.5 py-0.5">S1 Đầu cực: <b>{format(calculation.grossS1Kwh / 1_000_000)}M</b></span>
          <span className="rounded border bg-white px-1.5 py-0.5">S1 Điểm bán: <b>{format(calculation.netS1Kwh / 1_000_000)}M</b></span>
          <span className="rounded border bg-white px-1.5 py-0.5">S2 Đầu cực: <b>{format(calculation.grossS2Kwh / 1_000_000)}M</b></span>
          <span className="rounded border bg-white px-1.5 py-0.5">S2 Điểm bán: <b>{format(calculation.netS2Kwh / 1_000_000)}M</b></span>
        </div>
      )}
    </div>

    {/* 3. Kết quả so sánh */}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-[#f8fafc] px-3 py-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#20345f]">Kết quả so sánh suất hao nhiệt (kJ/kWh)</h2>
      </div>
      {!calculation ? (
        <div className={`p-3 text-xs ${calculationState.error ? "bg-red-50 text-red-800" : "text-slate-500"}`}>
          {calculationState.error ? (
            <>Đã nhận đủ 4 điểm đo nhưng chưa tính được PPA: <b>{calculationState.error}</b></>
          ) : (
            <>Chưa có dữ liệu PPA cho ngày {operatingDate.split("-").reverse().join("/")}. Hãy dùng nút <b>Lấy công tơ PPA từ QLKT</b> ở đầu trang này.</>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="report-data-table w-full min-w-[640px] text-xs">
            <thead>
              <tr className="bg-[#dcebf5] text-[#173b64]">
                <th className="p-2 text-left">Phạm vi</th>
                <th className="p-2 text-center">PPA (kJ/kWh)</th>
                <th className="p-2 text-center">Thực tế (kJ/kWh)</th>
                <th className="p-2 text-center">Chênh lệch (kJ/kWh)</th>
                <th className="p-2 text-center">Chênh lệch (%)</th>
                <th className="p-2 text-center">Đánh giá</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(row => {
                const comparison = compareHeatRate(row.actual, row.ppa);
                return <tr key={row.label} className="border-t">
                  <td className="p-2 font-bold text-black">{row.label}</td>
                  <td className="p-2 text-center tabular-nums text-black">{format(row.ppa)}</td>
                  <td className="p-2 text-center tabular-nums text-black">{format(row.actual)}</td>
                  <td className="p-2 text-center tabular-nums text-black">{format(comparison.difference)}</td>
                  <td className="p-2 text-center tabular-nums text-black">{format(comparison.percent)}</td>
                  <td className="p-2 text-center">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${comparison.status === "Đạt" ? "bg-emerald-100 text-emerald-800" : comparison.status === "Vượt PPA" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {comparison.status}
                    </span>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* 4. Nhận xét & nguyên nhân chênh lệch S1/S2 */}
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#20345f]">Thông tin vận hành & nhận xét tổ máy</h2>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
            Ngày {operatingDate.split("-").reverse().join("/")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || saving || savingNotes || isViewer}
            title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined}
            onClick={saveNotesOnly}
            className="h-7 rounded-lg border border-[#4057b5] bg-white px-3 text-xs font-bold text-[#4057b5] shadow-sm hover:bg-blue-50 disabled:opacity-50"
          >
            {savingNotes ? "Đang lưu…" : "Lưu thông tin S1/S2"}
          </button>
          {calculation && (
            <button
              type="button"
              disabled={loading || saving || savingNotes || isViewer}
              title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined}
              onClick={save}
              className="h-7 rounded-lg bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-3 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu toàn bộ kết quả ngày"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-blue-900">
          Công suất khả dụng S1 (MW)
          <input
            value={availableCapacityS1Mw}
            onChange={event => setAvailableCapacityS1Mw(event.target.value)}
            inputMode="decimal"
            disabled={loading || isViewer}
            className="rounded-lg border border-blue-200 bg-blue-50/50 p-2 text-sm font-semibold text-black outline-none focus:border-[#4c78a8] disabled:opacity-50"
            placeholder="Ví dụ: 622,5"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-amber-900">
          Công suất khả dụng S2 (MW)
          <input
            value={availableCapacityS2Mw}
            onChange={event => setAvailableCapacityS2Mw(event.target.value)}
            inputMode="decimal"
            disabled={loading || isViewer}
            className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-sm font-semibold text-black outline-none focus:border-[#4c78a8] disabled:opacity-50"
            placeholder="Ví dụ: 622,5"
          />
        </label>
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-blue-900">Nguyên nhân chênh lệch S1</span>
            <span className="font-normal text-slate-400">{noteS1.length}/1000</span>
          </div>
          <textarea
            value={noteS1}
            onChange={event => setNoteS1(event.target.value)}
            rows={2}
            className="resize-y rounded-lg border border-slate-300 p-2 text-xs font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-1 focus:ring-[#4c78a8]"
            placeholder="Ghi nhận tình trạng vận hành S1, độ tro/xỉ, máy nghiền, chất lượng than…"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-amber-900">Nguyên nhân chênh lệch S2</span>
            <span className="font-normal text-slate-400">{noteS2.length}/1000</span>
          </div>
          <textarea
            value={noteS2}
            onChange={event => setNoteS2(event.target.value)}
            rows={2}
            className="resize-y rounded-lg border border-slate-300 p-2 text-xs font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-1 focus:ring-[#4c78a8]"
            placeholder="Ghi nhận tình trạng vận hành S2, độ tro/xỉ, máy nghiền, chất lượng than…"
          />
        </label>
      </div>
      <NkvhPpaSyncButton operatingDate={operatingDate} disabled={loading || saving || savingNotes || isViewer}
        onApply={(s1, s2) => { if (s1.trim()) setEventS1(s1); if (s2.trim()) setEventS2(s2); }} />
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-blue-900">Tình hình vận hành / sự kiện liên quan S1</span>
            <span className="font-normal text-slate-400">{eventS1.length}/1000</span>
          </div>
          <textarea
            value={eventS1}
            onChange={event => setEventS1(event.target.value.slice(0, 1000))}
            rows={2}
            maxLength={1000}
            className="resize-y rounded-lg border border-slate-300 p-2 text-xs font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-1 focus:ring-[#4c78a8]"
            placeholder="Nhập tình hình vận hành hoặc sự kiện liên quan của tổ máy S1…"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-amber-900">Tình hình vận hành / sự kiện liên quan S2</span>
            <span className="font-normal text-slate-400">{eventS2.length}/1000</span>
          </div>
          <textarea
            value={eventS2}
            onChange={event => setEventS2(event.target.value.slice(0, 1000))}
            rows={2}
            maxLength={1000}
            className="resize-y rounded-lg border border-slate-300 p-2 text-xs font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-1 focus:ring-[#4c78a8]"
            placeholder="Nhập tình hình vận hành hoặc sự kiện liên quan của tổ máy S2…"
          />
        </label>
      </div>
    </div>

    {/* 5. Lịch sử trong tháng */}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b bg-[#f8fafc] px-3 py-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#20345f]">Lịch sử trong tháng</h2>
        <span className="text-[11px] font-semibold text-slate-500">{loading ? "Đang tải…" : `${history.length} ngày`}</span>
      </div>
      {history.length === 0 ? (
        <p className="p-4 text-center text-xs text-slate-500">Chưa lưu kết quả PPA trong tháng này.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="report-data-table w-full min-w-[900px] text-xs">
            <thead>
              <tr className="bg-[#dcebf5] text-[#173b64]">
                <th className="p-1.5 text-left">Ngày</th>
                <th className="p-1.5 text-center">PPA chung</th>
                <th className="p-1.5 text-center">Thực tế</th>
                <th className="p-1.5 text-center">Chênh lệch</th>
                <th className="p-1.5 text-center">Đánh giá</th>
                <th className="p-1.5 text-center">PPA S1</th>
                <th className="p-1.5 text-center">PPA S2</th>
                <th className="p-1.5 text-left">Nhận xét S1</th>
                <th className="p-1.5 text-left">Nhận xét S2</th>
              </tr>
            </thead>
            <tbody>
              {history.map(entry => {
                const rowActual = actualByDate.get(entry.operatingDate);
                const comparison = compareHeatRate(rowActual?.actualPlant ?? null, Number(entry.ppaPlant));
                const isSelected = entry.operatingDate === operatingDate;
                return (
                  <tr key={entry.operatingDate} className={`border-t transition ${isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"}`}>
                    <td className="p-1.5 font-bold">
                      <button type="button" onClick={() => setOperatingDate(entry.operatingDate)} className="text-left text-[#354a9f] hover:underline" title="Bấm để chọn và sửa nhận xét ngày này">
                        {entry.operatingDate.split("-").reverse().join("/")}
                      </button>
                    </td>
                    <td className="p-1.5 text-center text-black">{format(Number(entry.ppaPlant))}</td>
                    <td className="p-1.5 text-center text-black">{format(rowActual?.actualPlant)}</td>
                    <td className="p-1.5 text-center text-black">{format(comparison.difference)}</td>
                    <td className="p-1.5 text-center font-bold">{comparison.status}</td>
                    <td className="p-1.5 text-center text-black">{format(Number(entry.ppaS1))}</td>
                    <td className="p-1.5 text-center text-black">{format(Number(entry.ppaS2))}</td>
                    <td className="max-w-[180px] truncate p-1.5 text-slate-700 text-[11px]" title={entry.noteS1 || undefined}>{entry.noteS1 || "—"}</td>
                    <td className="max-w-[180px] truncate p-1.5 text-slate-700 text-[11px]" title={entry.noteS2 || undefined}>{entry.noteS2 || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* 6. DỰ PHÒNG: Nạp CSV hoặc dán dữ liệu thủ công (Ở DƯỚI CÙNG, dạng Collapsible) */}
    <details className="group rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-600 outline-none hover:text-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span>📁 Phương án dự phòng: Nạp CSV hoặc dán số liệu công tơ thủ công</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">Chỉ dùng khi tiện ích QLKT không khả dụng</span>
        </div>
        <span className="text-[11px] font-medium text-blue-600 group-open:hidden">Mở rộng ▼</span>
        <span className="text-[11px] font-medium text-blue-600 hidden group-open:inline">Thu gọn ▲</span>
      </summary>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Chọn 4 file CSV công tơ hoặc dán nội dung CSV vào ô dưới:</p>
          <div className="flex gap-2">
            <label className="cursor-pointer rounded-lg bg-[#4057b5] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#354a9f]">
              Chọn CSV
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" multiple className="sr-only" onChange={event => void addFiles(event.target.files)} />
            </label>
            <button type="button" onClick={clearImport} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
              Làm lại
            </button>
          </div>
        </div>
        <textarea
          value={pastedText}
          onChange={event => setPastedText(event.target.value)}
          rows={3}
          placeholder="Dán nguyên nội dung CSV tại đây nếu cần…"
          className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-[#fbfcfe] p-2 font-mono text-[11px] text-black outline-none focus:border-[#4c78a8]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Đã nhận: {sourceFiles.length ? sourceFiles.join(", ") : "chưa có CSV"}</p>
          <button type="button" onClick={addPastedData} className="rounded-lg border border-[#aebfe1] bg-[#eef3ff] px-3 py-1 text-xs font-bold text-[#354a9f] hover:bg-blue-100">
            Thêm dữ liệu vừa dán
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {selected.found.map(item => (
            <div key={item.key} className={`rounded-lg border p-2 ${item.found ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-slate-800">{item.label}</p>
                <span className={`text-[10px] font-extrabold ${item.found ? "text-emerald-700" : "text-amber-800"}`}>{item.found ? "Đã nhận" : "Thiếu"}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">{item.meter} · {item.channel}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  </section>;
}
