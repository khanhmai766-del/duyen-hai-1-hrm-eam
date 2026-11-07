"use client";
import { ClipboardList } from "lucide-react";
import { useCtktktRequest } from "@/hooks/useCtktkt";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import { EVENT_TYPES, SHIFT_METRICS, SHIFT_TIME_SLOTS, nextOperatingDate, validateOperatingEventDateRange, type OperatingEvent, type ShiftMetric } from "@/modules/ctktkt/lib/bcsx";
import { BCSX_COAL_STOCK_24H_CODE } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { deriveDailyValuesFromCtktkt } from "@/modules/ctktkt/lib/daily-source-links";
import { previousIsoDate, type CtktktDayEntries } from "@/modules/ctktkt/lib/ctktkt-report";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { hasPermission } from "@/modules/ctktkt/lib/auth/session";
import { defaultBcsxDate,millisecondsToBcsxRollover } from "@/modules/ctktkt/lib/operating-date";
import { MissingDataAlert, type MissingDataItem } from "@/modules/ctktkt/components/missing-data-alert";
import { ExportMissingDialog } from "@/modules/ctktkt/components/export-missing-dialog";
import { isMissingValue, listBcsxMissing } from "@/modules/ctktkt/lib/data-completeness";

type Unit = "S1" | "S2";
type ReadingsGrid = Record<ShiftMetric, string[]>;
type Section1ImportEntry = { unit: Unit; timeSlot: string; metric: ShiftMetric; value: string };
type Section1ImportDay = { date: string; entries: Section1ImportEntry[] };
type Section1ImportPackage = {
  kind: "BCSX_SECTION_1_HISTORY";
  version: 1;
  month: string;
  throughDay: number;
  totals: { days: number; entries: number; checks: number; passed: number; failed: number };
  days: Section1ImportDay[];
};

function emptyGrid(): ReadingsGrid {
  return { P: SHIFT_TIME_SLOTS.map(() => ""), Q: SHIFT_TIME_SLOTS.map(() => ""), D: SHIFT_TIME_SLOTS.map(() => ""), E: SHIFT_TIME_SLOTS.map(() => "") };
}

type EventDraft = { startDate: string; startTime: string; endDate: string; endTime: string; eventType: number; description: string };

function blankEventDraft(date: string): EventDraft {
  return { startDate: date, startTime: "", endDate: date, endTime: "", eventType: 1, description: "" };
}

type TotalsDraft = { dauCuc: string; thuongPham: string; gridReceivedMwh: string; thanTieuThu: string; thanTonKho: string };

function blankTotals(): TotalsDraft {
  return { dauCuc: "", thuongPham: "", gridReceivedMwh: "", thanTieuThu: "", thanTonKho: "" };
}

function parseAndScaleMwh(valStr: string | undefined): string {
  if (!valStr || !valStr.trim()) return "";
  const clean = valStr.trim().replace(",", ".");
  const num = Number(clean);
  if (!Number.isFinite(num)) return valStr;
  // Trong daily_inputs lưu đơn vị triệu kWh (ví dụ 10.47). Nếu < 100 thì quy đổi sang MWh (* 1000)
  if (num > 0 && num < 100) {
    const mwh = num * 1000;
    return String(Number(mwh.toFixed(2)));
  }
  return String(num);
}

function ctktktEntriesByDate(entries: Array<{ operatingDate: string; cell: string; value: string }>) {
  const byDate = new Map<string, CtktktDayEntries>();
  for (const entry of entries) {
    const values = byDate.get(entry.operatingDate) || {};
    values[entry.cell] = entry.value;
    byDate.set(entry.operatingDate, values);
  }
  return byDate;
}

export function BcsxReport() {
  const ctktktRequest = useCtktktRequest();

  const user = useSessionUser();
  const isViewer = !hasPermission(user, "edit_bcsx");
  const [operatingDate, setOperatingDate] = useState(defaultBcsxDate);
  const [unit, setUnit] = useState<Unit>("S1");
  const [grids, setGrids] = useState<Record<Unit, ReadingsGrid>>({ S1: emptyGrid(), S2: emptyGrid() });
  const [events, setEvents] = useState<Record<Unit, OperatingEvent[]>>({ S1: [], S2: [] });
  const [draft, setDraft] = useState<EventDraft>(() => blankEventDraft(defaultBcsxDate()));
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null);
  const [totals, setTotals] = useState<Record<Unit, TotalsDraft>>({ S1: blankTotals(), S2: blankTotals() });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCoalStock, setSavingCoalStock] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportMissingOpen, setExportMissingOpen] = useState(false);
  const [exportMissingItems, setExportMissingItems] = useState<MissingDataItem[]>([]);
  const [pendingExportTarget, setPendingExportTarget] = useState<"S1" | "S2" | "A0" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importingSection1, setImportingSection1] = useState(false);
  const [importingOperations, setImportingOperations] = useState(false);
  const section1ImportRef = useRef<HTMLInputElement | null>(null);
  const operationImportRef = useRef<HTMLInputElement | null>(null);
  const dirtyReadingsRef = useRef(new Set<string>());
  const autoDateEnabled=useRef(true);
  const automaticDate=useRef(operatingDate);

  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const check=()=>{
      clearTimeout(timer);
      const next=defaultBcsxDate();
      if(autoDateEnabled.current&&automaticDate.current!==next){
        automaticDate.current=next;setLoading(true);setOperatingDate(next);setDraft(blankEventDraft(next));setEditingEventIndex(null);
        setNotice("Đã chuyển ngày BCSX theo mốc 06:00 giờ Việt Nam.");
      }
      timer=setTimeout(check,millisecondsToBcsxRollover()+100);
    };
    check();
    window.addEventListener("focus",check);document.addEventListener("visibilitychange",check);
    return ()=>{clearTimeout(timer);window.removeEventListener("focus",check);document.removeEventListener("visibilitychange",check);};
  },[]);

  useEffect(() => {
    let cancelled = false;
    const controller=new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const [readingsRes, eventsRes] = await Promise.all([
          ctktktRequest(`/api/ctktkt/shift-readings?date=${operatingDate}`,{signal:controller.signal}),
          ctktktRequest(`/api/ctktkt/operating-events?date=${operatingDate}`,{signal:controller.signal}),
        ]);
        const [totalsRes, ctktktRes] = await Promise.all([
          ctktktRequest(`/api/ctktkt/daily-inputs?period=${operatingDate.slice(0, 7)}&date=${operatingDate}&scope=non-ktkt`,{signal:controller.signal}),
          ctktktRequest(`/api/ctktkt/ctktkt-report?period=${operatingDate.slice(0, 7)}&date=${operatingDate}&scope=daily-links`,{signal:controller.signal}),
        ]);
        const readingsJson = await readingsRes.json() as { entries?: { unit: Unit; timeSlot: string; metric: ShiftMetric; value: string }[]; error?: string };
        const eventsJson = await eventsRes.json() as { events?: (OperatingEvent & { unit: Unit })[]; error?: string };
        const totalsJson = await totalsRes.json() as { entries?: { operatingDate: string; fieldCode: string; value: string }[]; error?: string };
        const ctktktJson = await ctktktRes.json() as { entries?: { operatingDate: string; cell: string; value: string }[]; linkedEntries?: { operatingDate: string; cell: string; value: string }[]; error?: string };
        if (cancelled) return;
        if (readingsJson.error || eventsJson.error || totalsJson.error || ctktktJson.error) throw new Error(readingsJson.error || eventsJson.error || totalsJson.error || ctktktJson.error);

        const nextGrids: Record<Unit, ReadingsGrid> = { S1: emptyGrid(), S2: emptyGrid() };
        const slotIndex = new Map(SHIFT_TIME_SLOTS.map((s, i) => [s, i]));
        for (const entry of readingsJson.entries || []) {
          const idx = slotIndex.get(entry.timeSlot);
          if (idx === undefined) continue;
          nextGrids[entry.unit][entry.metric][idx] = entry.value;
        }
        setGrids(nextGrids);
        dirtyReadingsRef.current.clear();

        const nextEvents: Record<Unit, OperatingEvent[]> = { S1: [], S2: [] };
        for (const e of eventsJson.events || []) nextEvents[e.unit]?.push(e);
        setEvents(nextEvents);

        const byCode = new Map((totalsJson.entries || []).filter(e => e.operatingDate === operatingDate).map(e => [e.fieldCode, e.value]));
        const ktktByDate = ctktktEntriesByDate([...(ctktktJson.entries || []), ...(ctktktJson.linkedEntries || [])]);
        const ktktValues = deriveDailyValuesFromCtktkt(
          ktktByDate.get(operatingDate) || {},
          ktktByDate.get(previousIsoDate(operatingDate)),
        );
        const stock24h = byCode.get(BCSX_COAL_STOCK_24H_CODE) || "";

        setTotals({
          S1: {
            dauCuc: parseAndScaleMwh(ktktValues.B),
            thuongPham: parseAndScaleMwh(ktktValues.C),
            gridReceivedMwh: byCode.get("GRID_RECEIVE_S1") || "",
            thanTieuThu: ktktValues.AE_ADJ || "",
            thanTonKho: stock24h,
          },
          S2: {
            dauCuc: parseAndScaleMwh(ktktValues.H),
            thuongPham: parseAndScaleMwh(ktktValues.I),
            gridReceivedMwh: byCode.get("GRID_RECEIVE_S2") || "",
            thanTieuThu: ktktValues.AF_ADJ || "",
            thanTonKho: stock24h,
          },
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true;controller.abort(); };
  }, [operatingDate, ctktktRequest]);

  const grid = grids[unit];
  const unitEvents = events[unit];

  function setCoalStock(value: string) {
    setTotals(old => ({
      S1: { ...old.S1, thanTonKho: value },
      S2: { ...old.S2, thanTonKho: value },
    }));
  }

  async function saveCoalStock() {
    setSavingCoalStock(true); setError(null); setNotice(null);
    try {
      const response = await ctktktRequest("/api/ctktkt/bcsx-coal-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatingDate, value: totals[unit].thanTonKho }),
      });
      const body = await response.json() as { error?: string; value?: string };
      if (!response.ok || body.error) throw new Error(body.error || "Không lưu được than tồn kho 24h.");
      setCoalStock(body.value || totals[unit].thanTonKho);
      setNotice(`Đã lưu than tồn kho 24h toàn nhà máy ngày ${operatingDate.split("-").reverse().join("/")} và liên kết sang Chỉ tiêu KTKT.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lưu được than tồn kho 24h.");
    } finally {
      setSavingCoalStock(false);
    }
  }

  function changeOperatingDate(nextDate: string) {
    autoDateEnabled.current=false;
    setOperatingDate(nextDate);
    setDraft(blankEventDraft(nextDate));
    setEditingEventIndex(null);
  }

  function changeUnit(nextUnit: Unit) {
    setUnit(nextUnit);
    setDraft(blankEventDraft(operatingDate));
    setEditingEventIndex(null);
  }

  function setCell(metric: ShiftMetric, index: number, value: string) {
    setGrids(old => ({ ...old, [unit]: { ...old[unit], [metric]: old[unit][metric].map((v, i) => i === index ? value : v) } }));
    dirtyReadingsRef.current.add(`${unit}|${metric}|${index}`);
  }

  async function saveReadings() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const dirtyKeys = [...dirtyReadingsRef.current].filter(key => key.startsWith(`${unit}|`));
      const entries = dirtyKeys.map(key => {
        const [, metricText, indexText] = key.split("|");
        const metric = metricText as ShiftMetric;
        const index = Number(indexText);
        return { unit, timeSlot: SHIFT_TIME_SLOTS[index], metric, value: grid[metric][index].trim() };
      });
      if (!entries.length) throw new Error(`Không có ô nào của tổ máy ${unit} vừa thay đổi để lưu.`);
      const res = await ctktktRequest("/api/ctktkt/shift-readings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: operatingDate, entries }) });
      const json = await res.json() as { saved?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error || "Không lưu được số liệu.");
      for (const key of dirtyKeys) dirtyReadingsRef.current.delete(key);
      setNotice(`Đã lưu ${json.saved ?? entries.length} ô vừa thay đổi của tổ máy ${unit}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được số liệu.");
    } finally {
      setSaving(false);
    }
  }

  async function importSection1History(files: FileList | null) {
    if (!files || isViewer) return;
    setImportingSection1(true); setError(null); setNotice(null);
    const completed: Section1ImportDay[] = [];
    let backup: Record<string, Section1ImportEntry[]> | null = null;

    const postDay = async (day: Section1ImportDay) => {
      const response = await ctktktRequest("/api/ctktkt/shift-readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.date, entries: day.entries }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok || body.error) throw new Error(body.error || `Không ghi được Mục 1 ngày ${day.date}.`);
    };

    try {
      if (files.length !== 2) throw new Error("Hãy chọn đồng thời đúng 2 file Excel BCSX: một file S1 và một file S2.");
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append("files", file));
      const parseResponse = await ctktktRequest("/api/ctktkt/bcsx-section1-import", { method: "POST", body: formData });
      const rawParseResponse = await parseResponse.text();
      let parsed: Partial<Section1ImportPackage> & { error?: string };
      try {
        parsed = JSON.parse(rawParseResponse) as Partial<Section1ImportPackage> & { error?: string };
      } catch {
        throw new Error("Máy chủ không trả dữ liệu JSON hợp lệ khi đọc hai file Excel S1/S2.");
      }
      if (!parseResponse.ok || parsed.error) throw new Error(parsed.error || "Không đọc được hai file Excel S1/S2.");
      if (parsed.kind !== "BCSX_SECTION_1_HISTORY" || parsed.version !== 1 || !/^\d{4}-\d{2}$/.test(parsed.month || "") || !Number.isInteger(parsed.throughDay) || Number(parsed.throughDay) < 1 || Number(parsed.throughDay) > 31 || !Array.isArray(parsed.days) || parsed.days.length !== parsed.throughDay) {
        throw new Error("Gói nhập Mục 1 BCSX không đúng cấu trúc.");
      }
      if (!parsed.totals || parsed.totals.failed !== 0 || parsed.totals.checks !== parsed.totals.passed) {
        throw new Error("Gói nhập chưa đạt kiểm tra đầy đủ; chưa ghi dữ liệu.");
      }
      const importPackage = parsed as Section1ImportPackage;
      const expectedKeys = new Set((['S1', 'S2'] as const).flatMap(importUnit => SHIFT_TIME_SLOTS.flatMap(timeSlot => SHIFT_METRICS.map(metric => `${importUnit}|${timeSlot}|${metric.key}`))));
      const seenDates = new Set<string>();
      for (const [dayIndex, day] of importPackage.days.entries()) {
        const expectedDate = `${importPackage.month}-${String(dayIndex + 1).padStart(2, "0")}`;
        if (day.date !== expectedDate || seenDates.has(day.date) || !Array.isArray(day.entries) || day.entries.length !== expectedKeys.size) {
          throw new Error(`Dữ liệu ngày ${day.date || "không rõ"} không hợp lệ.`);
        }
        seenDates.add(day.date);
        const keys = new Set<string>();
        for (const entry of day.entries) {
          const key = `${entry.unit}|${entry.timeSlot}|${entry.metric}`;
          if (!expectedKeys.has(key) || keys.has(key) || !String(entry.value).trim() || !Number.isFinite(Number(entry.value))) {
            throw new Error(`Mục 1 ngày ${day.date} có ô thiếu, trùng hoặc không phải số.`);
          }
          keys.add(key);
        }
      }
      if (importPackage.totals.days !== importPackage.days.length || importPackage.totals.entries !== importPackage.days.length * expectedKeys.size || importPackage.totals.checks !== importPackage.totals.entries || importPackage.totals.passed !== importPackage.totals.entries) {
        throw new Error("Tổng kiểm tra trong gói nhập không khớp dữ liệu chi tiết.");
      }

      backup = {};
      for (const day of importPackage.days) {
        const response = await ctktktRequest(`/api/ctktkt/shift-readings?date=${encodeURIComponent(day.date)}`, { cache: "no-store" });
        const body = await response.json() as { entries?: Section1ImportEntry[]; error?: string };
        if (!response.ok || body.error) throw new Error(body.error || `Không sao lưu được ngày ${day.date}.`);
        backup[day.date] = body.entries || [];
      }
      const backupBlob = new Blob([JSON.stringify({ kind: "BCSX_SECTION_1_BACKUP", createdAt: new Date().toISOString(), entriesByDate: backup }, null, 2)], { type: "application/json" });
      const backupUrl = URL.createObjectURL(backupBlob);
      const backupLink = document.createElement("a");
      backupLink.href = backupUrl;
      backupLink.download = `BCSX_SECTION1_BACKUP_${importPackage.month}.json`;
      backupLink.click();
      URL.revokeObjectURL(backupUrl);

      for (const day of importPackage.days) {
        completed.push(day);
        await postDay(day);
      }

      for (const day of importPackage.days) {
        const response = await ctktktRequest(`/api/ctktkt/shift-readings?date=${encodeURIComponent(day.date)}`, { cache: "no-store" });
        const body = await response.json() as { entries?: Section1ImportEntry[]; error?: string };
        if (!response.ok || body.error) throw new Error(body.error || `Không đọc lại được ngày ${day.date}.`);
        const actual = new Map((body.entries || []).map(entry => [`${entry.unit}|${entry.timeSlot}|${entry.metric}`, entry.value]));
        for (const entry of day.entries) {
          const saved = actual.get(`${entry.unit}|${entry.timeSlot}|${entry.metric}`);
          if (saved === undefined || Math.abs(Number(saved) - Number(entry.value)) > 1e-9) throw new Error(`Đọc lại không khớp ${entry.unit} ${entry.timeSlot} ${entry.metric}, ngày ${day.date}.`);
        }
      }

      const lastDay = importPackage.days[importPackage.days.length - 1];
      const nextGrids: Record<Unit, ReadingsGrid> = { S1: emptyGrid(), S2: emptyGrid() };
      const slotIndex = new Map(SHIFT_TIME_SLOTS.map((slot, index) => [slot, index]));
      for (const entry of lastDay.entries) {
        const index = slotIndex.get(entry.timeSlot);
        if (index !== undefined) nextGrids[entry.unit][entry.metric][index] = entry.value;
      }
      setGrids(nextGrids);
      dirtyReadingsRef.current.clear();
      setOperatingDate(lastDay.date);
      setNotice(`Đã nhập và đọc lại xác nhận ${importPackage.totals.entries.toLocaleString("vi-VN")} giá trị Mục 1 cho ${importPackage.days.length} ngày. Mục 2 và nhật ký sự kiện không thay đổi.`);
    } catch (caught) {
      let rollbackMessage = "";
      if (backup && completed.length) {
        try {
          for (const day of [...completed].reverse()) {
            const previous = new Map((backup[day.date] || []).map(entry => [`${entry.unit}|${entry.timeSlot}|${entry.metric}`, entry.value]));
            await postDay({
              date: day.date,
              entries: day.entries.map(entry => ({ ...entry, value: previous.get(`${entry.unit}|${entry.timeSlot}|${entry.metric}`) || "" })),
            });
          }
          rollbackMessage = " Đã hoàn nguyên các ngày đã bắt đầu ghi.";
        } catch {
          rollbackMessage = " Hoàn nguyên tự động không trọn vẹn; dùng file BCSX_SECTION1_BACKUP vừa tải để phục hồi.";
        }
      }
      setError(`${caught instanceof Error ? caught.message : "Không nhập được lịch sử Mục 1."}${rollbackMessage}`);
    } finally {
      setImportingSection1(false);
      if (section1ImportRef.current) section1ImportRef.current.value = "";
    }
  }

  async function importOperationCommands(files: FileList | null) {
    if (!files || isViewer) return;
    setImportingOperations(true); setError(null); setNotice(null);
    try {
      if (files.length !== 1) throw new Error("Hãy chọn đúng 1 file DanhSachLenhKetThuc dạng .xlsx.");
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("date", operatingDate);
      const response = await ctktktRequest("/api/ctktkt/bcsx-operation-import", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Không nhập được file lệnh điều độ.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] || "DH1_Thoi_gian_VH.xlsx";
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      const eventsResponse = await ctktktRequest("/api/ctktkt/operating-events?date=" + encodeURIComponent(operatingDate), { cache: "no-store" });
      const eventsBody = await eventsResponse.json() as { events?: (OperatingEvent & { unit: Unit })[]; error?: string };
      if (!eventsResponse.ok || eventsBody.error) throw new Error(eventsBody.error || "Đã lưu và tải file QLKT nhưng không tải lại được Mục 3.");
      const nextEvents: Record<Unit, OperatingEvent[]> = { S1: [], S2: [] };
      for (const event of eventsBody.events || []) nextEvents[event.unit]?.push(event);
      setEvents(nextEvents);

      const s1Count = Number(response.headers.get("X-BCSX-S1-Events") || nextEvents.S1.length);
      const s2Count = Number(response.headers.get("X-BCSX-S2-Events") || nextEvents.S2.length);
      const ignoredRows = Number(response.headers.get("X-BCSX-Ignored-Rows") || 0);
      setNotice("Đã tự lưu Mục 3: S1 (" + s1Count + " sự kiện), S2 (" + s2Count + " sự kiện) và tải file QLKT " + fileName + (ignoredRows ? ". Bỏ qua " + ignoredRows + " dòng không thuộc ngày đang chọn hoặc không đủ điều kiện nhập." : "."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không nhập được file lệnh điều độ.");
    } finally {
      setImportingOperations(false);
      if (operationImportRef.current) operationImportRef.current.value = "";
    }
  }

  async function reloadTotalsFromCtktkt() {
    setError(null); setNotice(null);
    try {
      const period = operatingDate.slice(0, 7);
      const [totalsRes, ctktktRes] = await Promise.all([
        ctktktRequest(`/api/ctktkt/daily-inputs?period=${period}&date=${operatingDate}`),
        ctktktRequest(`/api/ctktkt/ctktkt-report?period=${period}&date=${operatingDate}&scope=daily-links`),
      ]);
      const totalsJson = await totalsRes.json() as { entries?: { operatingDate: string; fieldCode: string; value: string }[]; error?: string };
      const ctktktJson = await ctktktRes.json() as { entries?: { operatingDate: string; cell: string; value: string }[]; linkedEntries?: { operatingDate: string; cell: string; value: string }[]; error?: string };
      if (!totalsRes.ok || !ctktktRes.ok || totalsJson.error || ctktktJson.error) throw new Error(totalsJson.error || ctktktJson.error || "Không tải được số liệu liên kết.");
      const byCode = new Map((totalsJson.entries || []).filter(e => e.operatingDate === operatingDate).map(e => [e.fieldCode, e.value]));
      const ktktByDate = ctktktEntriesByDate([...(ctktktJson.entries || []), ...(ctktktJson.linkedEntries || [])]);
      const ktktValues = deriveDailyValuesFromCtktkt(
        ktktByDate.get(operatingDate) || {},
        ktktByDate.get(previousIsoDate(operatingDate)),
      );
      const stock24h = byCode.get(BCSX_COAL_STOCK_24H_CODE) || "";

      setTotals({
        S1: {
          dauCuc: parseAndScaleMwh(ktktValues.B),
          thuongPham: parseAndScaleMwh(ktktValues.C),
          gridReceivedMwh: byCode.get("GRID_RECEIVE_S1") || "",
          thanTieuThu: ktktValues.AE_ADJ || "",
          thanTonKho: stock24h,
        },
        S2: {
          dauCuc: parseAndScaleMwh(ktktValues.H),
          thuongPham: parseAndScaleMwh(ktktValues.I),
          gridReceivedMwh: byCode.get("GRID_RECEIVE_S2") || "",
          thanTieuThu: ktktValues.AF_ADJ || "",
          thanTonKho: stock24h,
        },
      });
      setNotice(`Đã nạp lại số liệu liên kết và than tồn kho 24h đã nhập tại BCSX cho ngày ${operatingDate.split("-").reverse().join("/")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải lại được số liệu từ Chỉ tiêu KTKT.");
    }
  }

  function addEvent() {
    if (isViewer) return;
    if (!draft.startTime || !draft.description.trim()) { setError("Cần nhập thời gian bắt đầu và mô tả sự kiện."); return; }
    const startAt = `${draft.startDate} ${draft.startTime}`;
    const endAt = draft.endTime ? `${draft.endDate} ${draft.endTime}` : "";
    const dateError = validateOperatingEventDateRange(operatingDate, startAt, endAt);
    if (dateError) {
      setError(dateError === "start-date" ? "Ngày bắt đầu phải là ngày vận hành đang chọn." : dateError === "end-date" ? "Ngày kết thúc chỉ được là ngày vận hành hoặc ngày kế tiếp." : "Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    const event: OperatingEvent = { startAt, endAt, eventType: draft.eventType, description: draft.description.trim() };
    setEvents(old => ({ ...old, [unit]: (editingEventIndex === null ? [...old[unit], event] : old[unit].map((item, index) => index === editingEventIndex ? event : item)).sort((a, b) => a.startAt.localeCompare(b.startAt)) }));
    setEditingEventIndex(null);
    setDraft(blankEventDraft(operatingDate));
    setError(null);
  }

  function editEvent(index: number) {
    if (isViewer) return;
    const event = unitEvents[index];
    setDraft({ startDate: event.startAt.slice(0, 10), startTime: event.startAt.slice(11), endDate: event.endAt ? event.endAt.slice(0, 10) : operatingDate, endTime: event.endAt ? event.endAt.slice(11) : "", eventType: event.eventType, description: event.description });
    setEditingEventIndex(index);
    setError(null);
  }

  function removeEvent(index: number) {
    if (isViewer) return;
    autoDateEnabled.current=false;
    setEvents(old => ({ ...old, [unit]: old[unit].filter((_, i) => i !== index) }));
    setEditingEventIndex(null);
    setDraft(blankEventDraft(operatingDate));
  }

  async function saveEvents() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const res = await ctktktRequest("/api/ctktkt/operating-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: operatingDate, unit, events: unitEvents }) });
      const json = await res.json() as { saved?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error || "Không lưu được nhật ký sự kiện.");
      setNotice(`Đã lưu nhật ký sự kiện tổ máy ${unit}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được nhật ký sự kiện.");
    } finally {
      setSaving(false);
    }
  }

  async function exportFile(target: "S1" | "S2" | "A0") {
    setExporting(target); setError(null);
    try {
      const res = await ctktktRequest(`/api/ctktkt/bcsx-export?date=${operatingDate}&unit=${target}`);
      if (!res.ok) { const json = await res.json().catch(() => null) as { error?: string } | null; throw new Error(json?.error || "Không xuất được file."); }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = match?.[1] || `BCSX_NMD_${target}_${operatingDate}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xuất được file.");
    } finally {
      setExporting(null);
    }
  }

  const [viewMode, setViewMode] = useState<"3shifts" | "ca1" | "ca2" | "ca3" | "scroll">("3shifts");
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedExcelText, setPastedExcelText] = useState("");
  const [pasteTargetStart, setPasteTargetStart] = useState<number>(0);

  const SHIFT_SLICES = useMemo(() => [
    { id: "ca1", label: "Ca 1", hours: "00:30 – 08:00", start: 0, end: 16, headerColor: "bg-[#dcebf5] text-[#173b64] border-blue-200" },
    { id: "ca2", label: "Ca 2", hours: "08:30 – 16:00", start: 16, end: 32, headerColor: "bg-[#dcf5e7] text-[#115e3c] border-emerald-200" },
    { id: "ca3", label: "Ca 3", hours: "16:30 – 23:59", start: 32, end: 48, headerColor: "bg-[#fef3d6] text-[#854d0e] border-amber-200" },
  ] as const, []);

  function goToBcsxMissingInput(item: MissingDataItem) {
    const [, metric, ...slotParts] = item.key.split(":");
    const slotIndex = SHIFT_TIME_SLOTS.indexOf(slotParts.join(":") as typeof SHIFT_TIME_SLOTS[number]);
    const targetUnit = item.group === "S2" ? "S2" : "S1";
    setExportMissingOpen(false);
    setPendingExportTarget(null);
    setUnit(targetUnit);
    setViewMode("scroll");
    if (slotIndex < 0) return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const input = document.getElementById(`cell-${metric}-${slotIndex}`) as HTMLInputElement | null;
      input?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      input?.focus({ preventScroll: true });
    }));
  }

  function applyPastedMatrix(text: string, startSlotIndex: number, startMetricKey: ShiftMetric = "P"): number {
    const rows = text.trim().split(/\r?\n/).map(row => row.split("\t"));
    if (!rows.length) return 0;

    const metricKeys: ShiftMetric[] = ["P", "Q", "D", "E"];
    const startMetricIdx = metricKeys.indexOf(startMetricKey);
    let count = 0;

    setGrids(old => {
      const currentUnitGrid = { ...old[unit] };
      const newGrid: ReadingsGrid = {
        P: [...currentUnitGrid.P],
        Q: [...currentUnitGrid.Q],
        D: [...currentUnitGrid.D],
        E: [...currentUnitGrid.E],
      };

      for (let r = 0; r < rows.length; r++) {
        const targetRowIdx = startSlotIndex + r;
        if (targetRowIdx >= SHIFT_TIME_SLOTS.length) break;

        const rowValues = rows[r];
        for (let c = 0; c < rowValues.length; c++) {
          const targetMetricIdx = startMetricIdx + c;
          if (targetMetricIdx >= metricKeys.length) break;

          const metricKey = metricKeys[targetMetricIdx];
          const val = rowValues[c].trim();
          newGrid[metricKey][targetRowIdx] = val;
          dirtyReadingsRef.current.add(`${unit}|${metricKey}|${targetRowIdx}`);
          count++;
        }
      }

      return { ...old, [unit]: newGrid };
    });

    return count;
  }

  function handleCellPaste(startMetric: ShiftMetric, startIndex: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    event.preventDefault();
    const count = applyPastedMatrix(text, startIndex, startMetric);
    if (count > 0) setNotice(`Đã dán ${count} giá trị từ clipboard vào bảng.`);
  }

  function handleKeyDown(metric: ShiftMetric, index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    const metricKeys: ShiftMetric[] = ["P", "Q", "D", "E"];
    const metricIdx = metricKeys.indexOf(metric);

    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      if (index + 1 < SHIFT_TIME_SLOTS.length) {
        const nextInput = document.getElementById(`cell-${metric}-${index + 1}`);
        nextInput?.focus();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index - 1 >= 0) {
        const prevInput = document.getElementById(`cell-${metric}-${index - 1}`);
        prevInput?.focus();
      }
    } else if (event.key === "ArrowRight") {
      if (event.currentTarget.selectionStart === event.currentTarget.value.length && metricIdx + 1 < metricKeys.length) {
        event.preventDefault();
        const nextCol = document.getElementById(`cell-${metricKeys[metricIdx + 1]}-${index}`);
        nextCol?.focus();
      }
    } else if (event.key === "ArrowLeft") {
      if (event.currentTarget.selectionStart === 0 && metricIdx - 1 >= 0) {
        event.preventDefault();
        const prevCol = document.getElementById(`cell-${metricKeys[metricIdx - 1]}-${index}`);
        prevCol?.focus();
      }
    }
  }

  function renderShiftTable(startIdx: number, endIdx: number, title?: string, hours?: string, headerClass?: string) {
    const slots = SHIFT_TIME_SLOTS.slice(startIdx, endIdx);
    const needDummyRow = (endIdx - startIdx) < 16;

    return (
      <div className="module-shift-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {title && (
          <div className={`flex items-center justify-between border-b px-2.5 py-1.5 ${headerClass || "bg-[#dcebf5] text-[#173b64]"}`}>
            <span className="font-extrabold text-xs tracking-tight">{title}</span>
            {hours && <span className="text-[10px] font-semibold opacity-85">{hours}</span>}
          </div>
        )}
        <table className="report-data-table w-full text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-[#173b64] text-[10px] font-bold">
              <th className="py-1 px-1 text-center w-[40px]">Giờ</th>
              <th className="py-1 px-0.5 text-center" title="Tổng P (MW) đầu cực máy phát">P cực</th>
              <th className="py-1 px-0.5 text-center" title="Tổng Q (MVAr) đầu cực máy phát">Q cực</th>
              <th className="py-1 px-0.5 text-center" title="Tổng P (MW) điểm bán điện">P bán</th>
              <th className="py-1 px-0.5 text-center" title="Điện áp thanh cái (kV)">U áp</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, offset) => {
              const i = startIdx + offset;
              return (
                <tr key={slot} className="border-t border-slate-100 hover:bg-blue-50/20">
                  <td className="py-0.5 px-1 text-center font-bold text-slate-600 text-[11px] bg-slate-50/60">{slot}</td>
                  {SHIFT_METRICS.map(m => (
                    <td key={m.key} className="p-0.5">
                      <input
                        id={`cell-${m.key}-${i}`}
                        value={grid[m.key][i]}
                        onChange={e => setCell(m.key, i, e.target.value)}
                        onKeyDown={e => handleKeyDown(m.key, i, e)}
                        onPaste={e => handleCellPaste(m.key, i, e)}
                        inputMode="decimal"
                        className="h-8 w-full rounded border border-slate-200 bg-white px-1 text-center font-mono text-[24px] font-bold text-black outline-none transition focus:border-[#334785] focus:bg-blue-50/50 focus:ring-1 focus:ring-[#334785]/20"
                        placeholder="—"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {needDummyRow && (
              <tr className="border-t border-slate-100 bg-slate-50/40 text-slate-300">
                <td className="py-0.5 px-1 text-center text-[10px]">—</td>
                <td colSpan={4} className="py-0.5 px-1 text-center text-[10px] italic text-slate-400">Kết thúc 24h</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const filledCount = useMemo(() => grid.P.filter(v => v.trim() !== "").length, [grid]);
  const bcsxMissing = useMemo(() => {
    const items: MissingDataItem[] = listBcsxMissing(grids);
    const totalLabels: Array<[keyof TotalsDraft, string]> = [
      ["thanTonKho", "Than tồn kho"],
    ];
    for (const targetUnit of ["S1", "S2"] as const) {
      for (const [key, label] of totalLabels) {
        if (isMissingValue(totals[targetUnit][key])) items.push({ key: `${targetUnit}:total:${key}`, label, group: `${targetUnit} · Tổng ngày` });
      }
    }
    return items;
  }, [grids, totals]);

  function requestExport(target: "S1" | "S2" | "A0") {
    if (loading || saving) return;
    const missing = bcsxMissing.filter(item => target === "A0" || item.key.startsWith(`${target}:`));
    if (missing.length) {
      setPendingExportTarget(target);
      setExportMissingItems(missing);
      setExportMissingOpen(true);
      return;
    }
    void exportFile(target);
  }

  function continueExportAnyway() {
    const target = pendingExportTarget;
    setExportMissingOpen(false);
    setPendingExportTarget(null);
    if (target) void exportFile(target);
  }

  return <div className="module-report bcsx-workspace flex flex-col gap-3" onChangeCapture={()=>{autoDateEnabled.current=false;}} onPasteCapture={()=>{autoDateEnabled.current=false;}}>
    <ExportMissingDialog
      open={exportMissingOpen}
      items={exportMissingItems}
      title={`BCSX ngày ${operatingDate.split("-").reverse().join("/")} · ${pendingExportTarget || ""}`}
      onClose={() => { setExportMissingOpen(false); setPendingExportTarget(null); }}
      onItemClick={goToBcsxMissingInput}
      onFillMissing={() => { setExportMissingOpen(false); setPendingExportTarget(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      onExportAnyway={continueExportAnyway}
    />
    <MissingDataAlert items={bcsxMissing} loading={loading} scope={`BCSX ngày ${operatingDate.split("-").reverse().join("/")}`} />
    {/* Header trang tinh gọn */}
    <div className="module-hero rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Nhãn mục (cùng nền với khối "Bảng theo dõi lượng nước sử dụng"); nhóm ngày + tổ máy + công cụ canh phải. */}
        <div className="module-heading-copy ktkt-section-title"><h2><ClipboardList className="size-5" aria-hidden />SẢN XUẤT</h2></div>
        <div className="bcsx-top-toolbar ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs font-bold text-slate-600">Ngày:</span>
          <DateField value={operatingDate} onChange={changeOperatingDate} className="w-[145px] h-8 text-xs"/>
          <div role="group" aria-label="Tổ máy" className="bcsx-unit-switch flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(["S1", "S2"] as const).map(u => (
              <button key={u} type="button" onClick={() => changeUnit(u)} className={`rounded-md px-3 py-1 text-xs font-bold transition ${unit === u ? "bg-[#334785] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {u}
              </button>
            ))}
          </div>
            {/* Thanh công cụ mục 1 (chuyển lên hàng trên cùng, bên phải Ngày / S1 / S2): Chế độ xem + Dán Excel + Nạp 2 file + Lưu */}
            <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Chế độ xem bảng thông số" className="bcsx-view-mode flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("3shifts")}
                className={`rounded px-2 py-0.5 font-bold transition ${viewMode === "3shifts" ? "bg-[#334785] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                title="Hiển thị 3 ca song song vừa khít màn hình, không cần cuộn"
              >
                3 Ca song song
              </button>
              <button
                type="button"
                onClick={() => setViewMode("ca1")}
                className={`rounded px-2 py-0.5 font-bold transition ${viewMode === "ca1" ? "bg-[#334785] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Ca 1
              </button>
              <button
                type="button"
                onClick={() => setViewMode("ca2")}
                className={`rounded px-2 py-0.5 font-bold transition ${viewMode === "ca2" ? "bg-[#334785] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Ca 2
              </button>
              <button
                type="button"
                onClick={() => setViewMode("ca3")}
                className={`rounded px-2 py-0.5 font-bold transition ${viewMode === "ca3" ? "bg-[#334785] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                Ca 3
              </button>
              <button
                type="button"
                onClick={() => setViewMode("scroll")}
                className={`rounded px-2 py-0.5 font-bold transition ${viewMode === "scroll" ? "bg-[#334785] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                title="Dạng 1 cột cuộn dọc cổ điển"
              >
                Cuộn dọc
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setPastedExcelText(""); setPasteModalOpen(true); }}
              className="h-7 rounded-lg border border-blue-300 bg-blue-50 px-2.5 text-xs font-bold text-[#334785] shadow-sm hover:bg-blue-100"
              title="Dán nhanh hàng loạt từ bảng tính Excel"
            >
              📋 Dán từ Excel
            </button>

            <input
              ref={section1ImportRef}
              type="file"
              accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
              multiple
              className="hidden"
              onChange={event => void importSection1History(event.target.files)}
            />
            <button
              type="button"
              onClick={() => section1ImportRef.current?.click()}
              disabled={importingSection1 || saving || isViewer}
              className="h-7 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
              title="Chọn đồng thời đúng 2 file Excel BCSX S1 và S2; hệ thống tự kiểm tra, sao lưu và đọc lại sau khi ghi"
            >
              {importingSection1 ? "Đang nhập 2 file…" : "Chọn 2 file S1 & S2"}
            </button>

            <button
              type="button"
              disabled={saving || isViewer}
              title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined}
              onClick={() => void saveReadings()}
              className="h-7 rounded-lg bg-gradient-to-r from-[#334785] to-[#4c6bbd] px-3.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu bảng thông số"}
            </button>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">{error}</p>}
      {notice && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{notice}</p>}
      {loading && <p className="mt-1 text-xs text-slate-400">Đang tải dữ liệu ngày…</p>}
    </div>

    {/* 1. Bảng thông số nửa giờ — 3 Ca song song không cần cuộn */}
    <div className="bcsx-half-hour-font rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="module-section-heading flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#173b64]">
            1. Bảng thông số nửa giờ — tổ máy {unit}
          </h2>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            {filledCount}/{SHIFT_TIME_SLOTS.length} điểm đã nhập ({Math.round(filledCount / SHIFT_TIME_SLOTS.length * 100)}%)
          </span>
        </div>

      </div>

      <p className="mt-1.5 text-[11px] text-slate-500">
        💡 <b>Mẹo nhập nhanh</b>: Bấm <b>Enter</b> hoặc <b>↓</b> để nhảy xuống ô dưới, <b>↑</b> nhảy lên trên, hoặc bấm trực tiếp vào ô rồi ấn <b>Ctrl + V</b> để dán dữ liệu copy từ Excel.
      </p>

      {/* Hiển thị bảng theo chế độ xem */}
      <div className="mt-2">
        {viewMode === "3shifts" ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {SHIFT_SLICES.map(slice => (
              <div key={slice.id}>
                {renderShiftTable(slice.start, slice.end, slice.label, slice.hours, slice.headerColor)}
              </div>
            ))}
          </div>
        ) : viewMode === "ca1" ? (
          <div className="max-w-xl mx-auto">
            {renderShiftTable(0, 16, "Ca 1", "00:30 – 08:00", "bg-[#dcebf5] text-[#173b64]")}
          </div>
        ) : viewMode === "ca2" ? (
          <div className="max-w-xl mx-auto">
            {renderShiftTable(16, 32, "Ca 2", "08:30 – 16:00", "bg-[#dcf5e7] text-[#115e3c]")}
          </div>
        ) : viewMode === "ca3" ? (
          <div className="max-w-xl mx-auto">
            {renderShiftTable(32, 48, "Ca 3", "16:30 – 23:59", "bg-[#fef3d6] text-[#854d0e]")}
          </div>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200">
            <table className="report-data-table w-full text-xs">
              <thead className="sticky top-0 bg-[#dcebf5] text-[#173b64]">
                <tr>
                  <th className="p-2 text-center w-[50px]">Thời điểm</th>
                  {SHIFT_METRICS.map(m => <th key={m.key} className="p-2 text-center font-semibold">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {SHIFT_TIME_SLOTS.map((slot, i) => (
                  <tr key={slot} className="border-t border-slate-100 even:bg-slate-50/60">
                    <td className="p-1 pl-2 font-semibold text-slate-600 text-center">{slot}</td>
                    {SHIFT_METRICS.map(m => (
                      <td key={m.key} className="p-0.5">
                        <input
                          id={`cell-${m.key}-${i}`}
                          value={grid[m.key][i]}
                          onChange={e => setCell(m.key, i, e.target.value)}
                          onKeyDown={e => handleKeyDown(m.key, i, e)}
                          onPaste={e => handleCellPaste(m.key, i, e)}
                          inputMode="decimal"
                          className="h-8 w-full rounded border border-slate-200 px-1 text-center font-mono text-[24px] font-bold text-black outline-none focus:border-[#334785]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {/* Modal Hỗ trợ Dán nhanh từ Excel */}
    {pasteModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-sm font-extrabold text-[#173b64]">📋 Dán nhanh dữ liệu từ Excel vào bảng</h3>
              <p className="mt-0.5 text-xs text-slate-500">Copy vùng dữ liệu trong Excel (P, Q, P bán, U) rồi dán vào ô bên dưới</p>
            </div>
            <button
              type="button"
              onClick={() => setPasteModalOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-700">Điền bắt đầu từ:</span>
              <select
                value={pasteTargetStart}
                onChange={e => setPasteTargetStart(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-black"
              >
                <option value={0}>Đầu ngày (00:30)</option>
                <option value={16}>Bắt đầu Ca 2 (08:30)</option>
                <option value={32}>Bắt đầu Ca 3 (16:30)</option>
              </select>
            </div>

            <textarea
              value={pastedExcelText}
              onChange={e => setPastedExcelText(e.target.value)}
              rows={7}
              placeholder="Dán nội dung copy từ Excel vào đây (hỗ trợ cả 4 cột P, Q, P bán, U hoặc 1 cột dọc)..."
              className="w-full resize-y rounded-xl border border-slate-300 bg-[#fbfcfe] p-2.5 font-mono text-xs text-black outline-none focus:border-[#334785] focus:ring-1 focus:ring-[#334785]"
            />
            <p className="text-[11px] text-slate-400">
              * Hệ thống sẽ tự động tách cột theo phím Tab và dòng theo phím Enter để điền chính xác vào bảng.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setPasteModalOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!pastedExcelText.trim()}
              onClick={() => {
                const count = applyPastedMatrix(pastedExcelText, pasteTargetStart, "P");
                setPasteModalOpen(false);
                setNotice(`Đã điền thành công ${count} giá trị vào bảng thông số.`);
              }}
              className="rounded-lg bg-gradient-to-r from-[#334785] to-[#4c6bbd] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              Áp dụng vào bảng
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-[#173b64]">2. Số liệu tổng ngày — tổ máy {unit}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Sản lượng và than tiêu thụ tự liên kết từ <Link href="/tien-ich/chi-tieu-ktkt/ctktkt-report" className="font-semibold text-[#334785] underline">Chỉ tiêu KTKT</Link>. <b>Than tồn kho 24h</b> nhập tay một lần tại đây, dùng chung cho S1/S2/A0 và tự liên kết ngược sang Cụm 1 Chỉ tiêu KTKT.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reloadTotalsFromCtktkt()}
            className="rounded-lg border border-[#334785] bg-white px-3 py-1.5 text-xs font-bold text-[#334785] hover:bg-slate-50"
            title="Nạp lại số liệu liên kết và than tồn kho đã lưu"
          >
            🔄 Nạp lại từ Chỉ tiêu KTKT
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Sản lượng đầu cực (MWh)
          <input disabled value={totals[unit].dauCuc} inputMode="decimal" placeholder="—" title="Tự liên kết từ Chỉ tiêu KTKT" className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-right font-mono text-xs font-semibold text-emerald-800"/>
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Sản lượng thương phẩm (MWh)
          <input disabled value={totals[unit].thuongPham} inputMode="decimal" placeholder="—" title="Tự liên kết từ Chỉ tiêu KTKT" className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-right font-mono text-xs font-semibold text-emerald-800"/>
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Than tiêu thụ quy ẩm 8,5% (tấn)
          <input disabled value={totals[unit].thanTieuThu} inputMode="decimal" placeholder="—" title="Tự tính từ Chỉ tiêu KTKT" className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-right font-mono text-xs font-semibold text-emerald-800"/>
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Than tồn kho 24h (tấn, toàn nhà máy)
          <span className="mt-1 flex gap-1.5">
            <input disabled={isViewer || savingCoalStock} value={totals[unit].thanTonKho} onChange={event => setCoalStock(event.target.value)} inputMode="decimal" placeholder="Nhập số tồn kho" title="Nhập tay tại BCSX; dùng chung S1/S2" className="min-w-0 flex-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-right font-mono text-[15px] font-semibold text-amber-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:opacity-60"/>
            <button type="button" disabled={isViewer || savingCoalStock || !totals[unit].thanTonKho.trim()} onClick={() => void saveCoalStock()} className="rounded-md bg-amber-600 px-2.5 text-xs font-bold text-white disabled:opacity-50">{savingCoalStock ? "Lưu…" : "Lưu"}</button>
          </span>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Các ô màu xanh là dữ liệu liên kết, không nhập lại. Ô màu vàng là số than tồn kho 24h nhập tay dùng chung toàn nhà máy; sau khi lưu sẽ tự hiển thị tại Cụm 1 Chỉ tiêu KTKT.</p>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-[#173b64]">3. Tình hình vận hành (nhật ký sự kiện) — tổ máy {unit}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Chọn file DanhSachLenhKetThuc: hệ thống tự nhận diện lệnh S1/S2, lưu ngay vào Mục 3 và tải file DH1 Thời gian vận hành để nhập lên QLKT. Có thể sửa tay sau khi nhập.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={operationImportRef}
            type="file"
            accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
            className="hidden"
            onChange={event => void importOperationCommands(event.target.files)}
          />
          <button
            type="button"
            disabled={importingOperations || saving || isViewer}
            title={isViewer ? "Tài khoản Chỉ xem không có quyền nhập dữ liệu." : "Chọn file DanhSachLenhKetThuc; hệ thống tự lưu S1/S2 và xuất file QLKT"}
            onClick={() => operationImportRef.current?.click()}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            {importingOperations ? "Đang nhận diện và xuất…" : "Nhập file lệnh & xuất QLKT"}
          </button>
          <button
            type="button"
            disabled={saving || isViewer}
            title={isViewer ? "Tài khoản Chỉ xem không có quyền lưu dữ liệu." : undefined}
            onClick={() => void saveEvents()}
            className="rounded-lg bg-[#334785] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu nhật ký sự kiện"}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-semibold text-slate-500">Ngày bắt đầu<DateField value={draft.startDate} onChange={startDate => setDraft(d => ({ ...d, startDate }))} min={operatingDate} max={operatingDate} className="mt-1 h-9 w-[145px]" disabled={isViewer}/></label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">Bắt đầu<input type="time" value={draft.startTime} onChange={e => setDraft(d => ({ ...d, startTime: e.target.value }))} className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-black"/></label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">Ngày kết thúc<DateField value={draft.endDate} onChange={endDate => setDraft(d => ({ ...d, endDate }))} min={operatingDate} max={nextOperatingDate(operatingDate)} className="mt-1 h-9 w-[145px]" disabled={isViewer}/></label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">Kết thúc<input type="time" value={draft.endTime} onChange={e => setDraft(d => ({ ...d, endTime: e.target.value }))} className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-black"/></label>
        <label className="flex flex-col text-xs font-semibold text-slate-500">Loại sự kiện<select value={draft.eventType} onChange={e => setDraft(d => ({ ...d, eventType: Number(e.target.value) }))} className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-black">{EVENT_TYPES.map(t => <option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}</select></label>
        <label className="flex min-w-[220px] flex-1 flex-col text-xs font-semibold text-slate-500">Mô tả<input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Ví dụ: Tăng tải S1 từ 435.7MW lên 536MW" className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-black"/></label>
        <button type="button" disabled={isViewer} onClick={addEvent} className="rounded-lg border border-[#334785] px-3 py-1.5 text-xs font-bold text-[#334785] hover:bg-slate-50 disabled:opacity-50">{editingEventIndex === null ? "+ Thêm dòng" : "Cập nhật"}</button>
        {editingEventIndex !== null && <button type="button" onClick={() => { setEditingEventIndex(null); setDraft(blankEventDraft(operatingDate)); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">Hủy</button>}
      </div>
      <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
        <table className="report-data-table w-full min-w-[560px] text-xs">
          <thead className="bg-[#dcebf5] text-[#173b64]">
            <tr>
              <th className="p-2 text-left w-[80px]">Bắt đầu</th>
              <th className="p-2 text-left w-[80px]">Kết thúc</th>
              <th className="p-2 text-center w-[60px]">Loại</th>
              <th className="p-2 text-left">Sự kiện</th>
              <th className="p-2 text-center w-[92px]">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {unitEvents.map((e, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="p-2 font-mono text-black font-semibold">{e.startAt.slice(8, 10)}/{e.startAt.slice(5, 7)}/{e.startAt.slice(0, 4)} {e.startAt.slice(11)}</td>
                <td className="p-2 font-mono text-black">{e.endAt ? `${e.endAt.slice(8, 10)}/${e.endAt.slice(5, 7)}/${e.endAt.slice(0, 4)} ${e.endAt.slice(11)}` : "—"}</td>
                <td className="p-2 text-center text-black font-bold">{e.eventType}</td>
                <td className="p-2 text-sm leading-5 text-black">{e.description}</td>
                <td className="p-2">
                  <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                    <button type="button" disabled={isViewer} onClick={() => editEvent(i)} className="min-w-9 rounded px-1.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50">Sửa</button>
                    <button type="button" disabled={isViewer} onClick={() => removeEvent(i)} className="min-w-9 rounded px-1.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
            {unitEvents.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-center text-slate-400 italic">
                  Chưa có sự kiện nào cho tổ máy {unit} trong ngày {operatingDate.split("-").reverse().join("/")}. Bấm &quot;Nhập file lệnh &amp; xuất QLKT&quot; hoặc thêm dòng thủ công.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-extrabold text-[#173b64]">4. Xuất file BCSX_NMD</h2>
      <p className="mt-1 text-sm text-slate-500">Xuất đúng định dạng file mẫu gốc, đã điền số liệu — nhớ Lưu bảng thông số, Lưu số liệu tổng ngày và Lưu nhật ký sự kiện trước khi xuất. File A0 cộng S1+S2 cho P/Q/P điểm bán; riêng Utc 220 kV lấy S1. Nhật ký sự kiện A0 xếp các dòng của S1 trước rồi đến S2.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["A0", "S1", "S2"] as const).map(target => <button key={target} type="button" disabled={exporting !== null || loading || saving} onClick={() => requestExport(target)} className="rounded-lg border border-[#334785] bg-white px-4 py-2 text-sm font-bold text-[#334785] disabled:opacity-50">{exporting === target ? "Đang xuất…" : `Xuất BCSX_NMD_${target}`}</button>)}
      </div>
    </div>
  </div>;
}
