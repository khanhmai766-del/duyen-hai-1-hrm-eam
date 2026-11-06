"use client";
import { MonthField } from "./ui/month-field";
import { useCtktktRequest } from "@/hooks/useCtktkt";
import { canEditDailyInput } from "@/modules/ctktkt/lib/auth/daily-input-permissions";

import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ctktkt/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/modules/ctktkt/components/ui/table";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { decodeQlktSyncHash, normalizeQlktValue, qlktFieldLabels, validateQlktSyncPayload, type QlktSyncPayload } from "@/modules/ctktkt/lib/qlkt-sync";
import { calculateDailyProduction } from "@/modules/ctktkt/lib/daily-production-calculations";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { canViewPreAdjustmentHeatRate, hasPermission, isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { canEditOperatingDate, defaultOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { previousIsoDate, type CtktktDayEntries } from "@/modules/ctktkt/lib/ctktkt-report";
import { CTKTKT_LINKED_DAILY_CODES, deriveDailyValuesFromCtktkt, QLKT_DIRECT_DAILY_CODES } from "@/modules/ctktkt/lib/daily-source-links";
import { isQlktExtensionOutdated, QLKT_EXTENSION_DOWNLOAD_URL, REQUIRED_QLKT_EXTENSION_VERSION } from "@/modules/ctktkt/lib/qlkt-extension-version";
import { buildQlktRangeEntries, listIsoDates, QLKT_RANGE_SYNC_DEFAULT_FROM } from "@/modules/ctktkt/lib/qlkt-range-sync";
import { MonthlyHeaderAlert } from "@/modules/ctktkt/components/missing-data-alert";
import { listMonthlyMissing } from "@/modules/ctktkt/lib/data-completeness";
import { Activity, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Info, PencilLine, RefreshCw, Save, TriangleAlert } from "lucide-react";
import "./daily-production-table.css";

type Group = "production" | "environment" | "operation";
type Field = { code: string; label: string; unit?: string; input?: boolean; noteFor?: string; width?: string };
type DailyRow = Record<string, string>;
type LoadedEntry = { operatingDate: string; fieldCode: string; value: string; note: string };
type CtktktLoadedEntry = { operatingDate: string; cell: string; value: string };
type QlktResult = { ok?: boolean; payload?: unknown; error?: string };
type RangeState = { running: boolean; done: number; total: number; saved: number; current: string; failed: string[] };

const displayDate = (iso: string) => iso.split("-").reverse().join("/");

/** Gửi SYNC_ALL cho một ngày và chờ đúng kết quả của yêu cầu đó (không đụng luồng đồng bộ một ngày). */
function requestQlktDay(operatingDate: string, timeoutMs = 360000) {
  return new Promise<QlktResult>(resolve => {
    const channel = "ctktkt-qlkt-sync";
    const requestId = crypto.randomUUID();
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as { channel?: string; sender?: string; type?: string; requestId?: string; result?: QlktResult };
      if (!data || data.channel !== channel || data.sender !== "ctktkt-extension" || data.type !== "SYNC_ALL_RESULT" || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data.result || { ok: false });
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, error: "QLKT phản hồi quá lâu" });
    }, timeoutMs);
    window.addEventListener("message", onMessage);
    window.postMessage({ channel, sender: "ctktkt-web", type: "SYNC_ALL", requestId, operatingDate }, window.location.origin);
  });
}

function directQlktPayload(payload: QlktSyncPayload): QlktSyncPayload {
  return { ...payload, entries: payload.entries.filter(entry => QLKT_DIRECT_DAILY_CODES.has(entry.fieldCode)) };
}

const groups: { key: Group; label: string; description: string }[] = [
  { key: "production", label: "Chỉ tiêu KTKT", description: "Điện năng, than và hiệu suất vận hành." },
  { key: "environment", label: "Chỉ tiêu phụ", description: "Tiêu thụ NH₃ và nước, lượng xỉ." },
  { key: "operation", label: "Thời gian vận hành, hơi cấp VH2", description: "Hơi cấp VH2, áp suất và các khoảng thời gian vận hành." },
];

const fields: Record<Group, Field[]> = {
  production: [
    { code: "B", label: "Đầu cực S1", unit: "triệu kWh", input: true }, { code: "C", label: "Điểm bán S1", unit: "triệu kWh", input: true },
    { code: "D", label: "Tự dùng S1", unit: "MWh" }, { code: "E", label: "% tự dùng S1", unit: "%" }, { code: "F", label: "Giờ phát S1", unit: "giờ", input: true }, { code: "G", label: "CS phát BQ S1", unit: "MW" },
    { code: "H", label: "Đầu cực S2", unit: "triệu kWh", input: true }, { code: "I", label: "Điểm bán S2", unit: "triệu kWh", input: true },
    { code: "J", label: "Tự dùng S2", unit: "MWh" }, { code: "K", label: "% tự dùng S2", unit: "%" }, { code: "L", label: "Giờ phát S2", unit: "giờ", input: true }, { code: "M", label: "CS phát BQ S2", unit: "MW" },
    { code: "N", label: "Tổng SL đầu cực", unit: "MWh" }, { code: "O", label: "Tổng SL điểm bán", unit: "MWh" }, { code: "P", label: "Tổng SL tự dùng", unit: "MWh" }, { code: "Q", label: "% tự dùng", unit: "%" }, { code: "R", label: "Tổng giờ phát", unit: "giờ" }, { code: "S", label: "Tổng CS phát BQ", unit: "MW" },
    { code: "X", label: "Dầu FO tiêu thụ", unit: "tấn", input: true }, { code: "AE", label: "Than nguyên trạng S1", unit: "tấn", input: true }, { code: "AF", label: "Than nguyên trạng S2", unit: "tấn", input: true }, { code: "AE_ADJ", label: "Than quy ẩm S1", unit: "tấn" }, { code: "AF_ADJ", label: "Than quy ẩm S2", unit: "tấn" }, { code: "AJ", label: "Nhiệt trị", unit: "kJ/kg", input: true },
    { code: "AR", label: "Than tồn kho 06h00", unit: "tấn", input: true }, { code: "AT", label: "Than nhập 06h (PMIS)", unit: "tấn", input: true }, { code: "CJ", label: "Độ ẩm TB ngày", unit: "%", input: true }, { code: "CX", label: "Nhiệt trị trước chỉnh", unit: "kJ/kg", input: true },
    { code: "T", label: "Tổng than nguyên trạng", unit: "tấn" }, { code: "U", label: "Suất hao than thô NM", unit: "g/kWh" }, { code: "V", label: "Suất hao nhiệt thô NM", unit: "kJ/kWh" }, { code: "W", label: "Suất hao nhiệt tinh NM", unit: "kJ/kWh" }, { code: "Y", label: "Suất hao than thô S1", unit: "g/kWh" }, { code: "Z", label: "Suất hao than thô S2", unit: "g/kWh" }, { code: "AA", label: "Suất hao than tinh NM", unit: "g/kWh" }, { code: "AG", label: "Suất hao than tinh S1", unit: "g/kWh" }, { code: "AH", label: "Suất hao than tinh S2", unit: "g/kWh" }, { code: "AI", label: "Suất hao than tinh DH1", unit: "g/kWh" }, { code: "AL", label: "Suất hao nhiệt tinh S1", unit: "kJ/kWh" }, { code: "AM", label: "Suất hao nhiệt tinh S2", unit: "kJ/kWh" }, { code: "AN", label: "Suất hao nhiệt thô S1", unit: "kJ/kWh" }, { code: "AO", label: "Suất hao nhiệt thô S2", unit: "kJ/kWh" }, { code: "AP", label: "Suất hao nhiệt tinh S1 trước chỉnh", unit: "kJ/kWh" }, { code: "AQ", label: "Suất hao nhiệt tinh S2 trước chỉnh", unit: "kJ/kWh" }, { code: "AK", label: "Nhiệt trị", unit: "kcal/kg" },
  ],
  environment: [
    { code: "BN", label: "NH₃ theo mức bồn", unit: "tấn", input: true }, { code: "BQ", label: "NH₃ DCS S1", unit: "tấn", input: true }, { code: "BR", label: "NH₃ DCS S2", unit: "tấn", input: true }, { code: "CN", label: "NH₃ nhập trong ngày", unit: "tấn", input: true },
    { code: "BO", label: "SH NH₃ đầu cực DH1", unit: "g/kWh" }, { code: "BP", label: "SH NH₃ trên lưới DH1", unit: "g/kWh" }, { code: "BS", label: "Tổng NH₃ DCS", unit: "tấn" }, { code: "BT", label: "SH NH₃ đầu cực S1", unit: "g/kWh" }, { code: "BU", label: "SH NH₃ trên lưới S1", unit: "g/kWh" }, { code: "BV", label: "SH NH₃ đầu cực S2", unit: "g/kWh" }, { code: "BW", label: "SH NH₃ trên lưới S2", unit: "g/kWh" }, { code: "BX", label: "SH NH₃ đầu cực DH1", unit: "g/kWh" }, { code: "BY", label: "SH NH₃ trên lưới DH1", unit: "g/kWh" },
    { code: "BZ", label: "Xả xỉ S1", unit: "tấn", input: true }, { code: "CA", label: "Xả xỉ S2", unit: "tấn", input: true }, { code: "CC", label: "Nước bổ sung S1", unit: "m³", input: true }, { code: "CD", label: "Nước bổ sung S2", unit: "m³", input: true },
    { code: "CE", label: "Nước tái sinh S1", unit: "m³", input: true }, { code: "CF", label: "Nước tái sinh S2", unit: "m³", input: true },
    { code: "CM", label: "Bi nghiền bổ sung", unit: "kg", input: true },
  ],
  operation: [
    { code: "CQ", label: "Hơi cấp VH2", unit: "tấn", input: true }, { code: "CR", label: "Áp suất hơi VH2", unit: "bar", input: true }, { code: "CS", label: "Thời gian dự phòng", unit: "giờ", input: true }, { code: "CT", label: "Thời gian sự cố", unit: "giờ", input: true }, { code: "CU", label: "Thời gian sửa chữa/bảo dưỡng", unit: "giờ", input: true }, { code: "CV", label: "Thời gian khởi động", unit: "giờ", input: true }, { code: "CW", label: "Ghi chú vận hành", input: true, width: "min-w-64" },
  ],
};

const numericCodes = new Set(Object.values(fields).flat().filter(f => f.input && f.code !== "CW").map(f => f.code));
const monthlyTotalCodes = new Set([
  "B", "C", "D", "F", "H", "I", "J", "L", "N", "O", "P", "R",
  "X", "AE", "AF", "AE_ADJ", "AF_ADJ", "AT",
  "BN", "BQ", "BR", "CN", "BZ", "CA", "CC", "CD", "CE", "CF", "CM",
  "CQ", "CS", "CT", "CU", "CV",
]);
const currentPeriod = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(new Date());
const numberValue = (value?: string) => { if (!value?.trim()) return null; const n = Number(value.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const formatResult = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
const formatInputValue = (value?: string) => { if (!value) return ""; const parsed=numberValue(value); return parsed===null?value:formatResult(parsed); };

function isWaterAbnormal(rows: DailyRow[], dayIndex: number, code: "CE" | "CF") {
  const current = numberValue(rows[dayIndex]?.[code]), previous = dayIndex > 0 ? numberValue(rows[dayIndex-1]?.[code]) : null;
  return current !== null && previous !== null && current > previous * 1.3 && current - previous >= 100;
}

export function DailyProductionTable() {
  const ctktktRequest = useCtktktRequest();

  const user = useSessionUser();
  const canEditMonthlyInputs = hasPermission(user, "edit_daily_inputs") || hasPermission(user, "edit_pmis");
  const isViewer = !canEditMonthlyInputs;
  const canSyncDaily = hasPermission(user, "sync_qlkt") && hasPermission(user, "edit_daily_inputs");
  const [period, setPeriod] = useState(currentPeriod), [group, setGroup] = useState<Group>("production");
  const [showCalculated, setShowCalculated] = useState(false), [rows, setRows] = useState<DailyRow[]>(() => Array.from({ length: 31 }, () => ({})));
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [dirtyCount, setDirtyCount] = useState(0);
  const [noteCell, setNoteCell] = useState<{ day: number; code: string; label: string } | null>(null), [noteDraft, setNoteDraft] = useState("");
  const [syncHelp, setSyncHelp] = useState(false), [pendingSync, setPendingSync] = useState<QlktSyncPayload | null>(null), [selectedSyncCodes, setSelectedSyncCodes] = useState<Set<string>>(new Set());
  const [syncDate, setSyncDate] = useState(defaultOperatingDate), [extensionVersion, setExtensionVersion] = useState(""), [syncingQlkt, setSyncingQlkt] = useState(false), [syncProgress, setSyncProgress] = useState("");
  const [focusedCell, setFocusedCell] = useState("");
  const [ctktktLinkedCells, setCtktktLinkedCells] = useState<Set<string>>(new Set());
  const [chartField, setChartField] = useState<Field | null>(null);
  const [overviewCode, setOverviewCode] = useState("");
  const [rangeFrom, setRangeFrom] = useState(QLKT_RANGE_SYNC_DEFAULT_FROM), [rangeTo, setRangeTo] = useState(defaultOperatingDate);
  const [rangeState, setRangeState] = useState<RangeState | null>(null), [reloadKey, setReloadKey] = useState(0);
  const rangeStopRef = useRef(false);
  // Bấm vào 1 ô (dù là ô nhập liệu hay ô kết quả tính) sẽ tô vàng ô đó để dễ dò theo hàng/cột trên
  // bảng rộng nhiều cột; bấm lại đúng ô đó để bỏ tô.
  const [selectedCell, setSelectedCell] = useState("");
  const cellBg = (key: string) => selectedCell === key ? "bg-yellow-200" : "bg-white";
  const selectCell = (key: string) => setSelectedCell(current => current === key ? "" : key);
  const dirty = useRef(new Set<string>());
  const qlktRequestRef = useRef<{id:string;timer:number}|null>(null);
  const days = useMemo(() => { const [y,m] = period.split("-").map(Number); return new Date(y,m,0).getDate(); }, [period]);
  const today = vietnamDateIso();
  const isAdmin = isAdminUser(user);
  const canEditDate = (operatingDate: string) => canEditMonthlyInputs && canEditOperatingDate(operatingDate, isAdmin, today);
  const extensionOutdated = isQlktExtensionOutdated(extensionVersion);
  const monthlyMissing = useMemo(() => listMonthlyMissing(
    rows,
    period,
    defaultOperatingDate(),
    Object.values(fields).flat().filter(field => field.input && field.code !== "CW" && field.code !== "X").map(field => ({ code: field.code, label: field.label })),
  ), [rows, period]);

  // Reset view state while rendering when the month changes, instead of synchronously inside the effect.
  const [trackedPeriod, setTrackedPeriod] = useState(period);
  if (trackedPeriod !== period) { setTrackedPeriod(period); setLoading(true); setError(""); setMessage(""); setDirtyCount(0); }
  const markDirty = (key: string) => { dirty.current.add(key); setDirtyCount(dirty.current.size); };

  useEffect(() => { const controller = new AbortController(); dirty.current.clear();
    Promise.all([
      ctktktRequest(`/api/ctktkt/daily-inputs?period=${encodeURIComponent(period)}`, { cache:"no-store", signal:controller.signal }),
      ctktktRequest(`/api/ctktkt/ctktkt-report?period=${encodeURIComponent(period)}`, { cache:"no-store", signal:controller.signal }),
    ]).then(async ([dailyResponse, ctktktResponse]) => {
      const body=await dailyResponse.json() as { entries?:LoadedEntry[]; error?:string }; if(!dailyResponse.ok) throw new Error(body.error||"Không tải được dữ liệu.");
      const next=Array.from({length:31},()=>({} as DailyRow)); for(const e of body.entries||[]){const d=Number(e.operatingDate.slice(8,10))-1; if(d>=0&&d<31){next[d][e.fieldCode]=e.value; if(e.note) next[d][`${e.fieldCode}_NOTE`]=e.note;}}
      const linked = new Set<string>();
      for (let day = 0; day < 31; day += 1) {
        for (const code of CTKTKT_LINKED_DAILY_CODES) {
          delete next[day][code];
          linked.add(`${day}:${code}`);
        }
      }
      if (ctktktResponse.ok) {
        const ctktktBody = await ctktktResponse.json() as { entries?: CtktktLoadedEntry[]; linkedEntries?: CtktktLoadedEntry[] };
        const byDate = new Map<string, CtktktDayEntries>();
        for (const entry of [...(ctktktBody.entries || []), ...(ctktktBody.linkedEntries || [])]) {
          const values = byDate.get(entry.operatingDate) || {};
          values[entry.cell] = entry.value;
          byDate.set(entry.operatingDate, values);
        }
        for (const [operatingDate, values] of byDate) {
          const day = Number(operatingDate.slice(8, 10)) - 1;
          if (day < 0 || day >= 31) continue;
          const derived = deriveDailyValuesFromCtktkt(values, byDate.get(previousIsoDate(operatingDate)));
          for (const [code, value] of Object.entries(derived)) {
            next[day][code] = value;
            linked.add(`${day}:${code}`);
          }
        }
      }
      for (let day = 0; day < 31; day += 1) {
        const operatingDate = `${period}-${String(day + 1).padStart(2, "0")}`;
        if (operatingDate > vietnamDateIso()) next[day] = {};
      }
      setCtktktLinkedCells(linked); setRows(next);
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Không tải được dữ liệu.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);}); return ()=>controller.abort(); },[period,reloadKey, ctktktRequest]);

  useEffect(() => {
    const payload = decodeQlktSyncHash(window.location.hash);
    if (!payload) return;
    const directPayload = directQlktPayload(payload);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the QLKT hand-off hash after hydration
    setPendingSync(directPayload);
    setSelectedSyncCodes(new Set(directPayload.entries.map(entry => entry.fieldCode)));
    setPeriod(payload.operatingDate.slice(0, 7));
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    const channel="ctktkt-qlkt-sync";
    const handleMessage=async(event:MessageEvent)=>{
      if(event.source!==window||event.origin!==window.location.origin)return;
      const data=event.data as {channel?:string;sender?:string;type?:string;version?:string;requestId?:string;result?:{ok?:boolean;payload?:unknown;error?:string}};
      if(!data||data.channel!==channel||data.sender!=="ctktkt-extension")return;
      if(data.type==="READY"){setExtensionVersion(String(data.version||"đã kết nối"));return;}
      if(data.type!=="SYNC_ALL_RESULT"||!qlktRequestRef.current||data.requestId!==qlktRequestRef.current.id)return;
      window.clearTimeout(qlktRequestRef.current.timer); qlktRequestRef.current=null;
      if(!data.result?.ok){setSyncingQlkt(false);setSyncProgress("");setError(data.result?.error||"Chưa đồng bộ được dữ liệu từ QLKT.");return;}
      const payload=validateQlktSyncPayload(data.result.payload);
      if(!payload){setSyncingQlkt(false);setError("Dữ liệu ngày từ tiện ích chưa đủ hoặc không đúng ngày.");setSyncProgress("");return;}
      setPeriod(payload.operatingDate.slice(0,7));
       const directPayload=directQlktPayload(payload);
       setPendingSync(directPayload);
       setSelectedSyncCodes(new Set(directPayload.entries.map(entry=>entry.fieldCode)));
      setMessage(`Đã nhận dữ liệu ngày ${payload.operatingDate.split("-").reverse().join("/")}. Kiểm tra và xác nhận các chỉ tiêu cần đưa vào bảng.`);
      setSyncProgress("");
      setSyncingQlkt(false);
    };
    window.addEventListener("message",handleMessage);
    window.postMessage({channel,sender:"ctktkt-web",type:"PING"},window.location.origin);
    return()=>{window.removeEventListener("message",handleMessage);if(qlktRequestRef.current)window.clearTimeout(qlktRequestRef.current.timer);};
  },[]);

  // Bấm vào tiêu đề cột để xem biểu đồ diễn biến toàn bộ các ngày trong tháng của cột đó — dùng
  // đúng nguồn giá trị theo view đang mở (nhập liệu thô hay kết quả tính) nên chart luôn khớp bảng.
  function fieldSeries(field: Field) {
    return Array.from({ length: days }, (_, d) => {
      const value = field.input ? numberValue(rows[d]?.[field.code]) : (calculateDailyProduction(rows[d] || {})[field.code] ?? null);
      return { day: d + 1, value };
    });
  }
  function seriesDomain(field: Field): [number, number] {
    const values = fieldSeries(field).map(point => point.value).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!values.length) return [0, 1];
    const min = Math.min(...values), max = Math.max(...values);
    const pad = max === min ? Math.max(1, Math.abs(max) * 0.1) : (max - min) * 0.2;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }

  const visibleFields = fields[group]
    .filter(f => f.code !== "CX" || canViewPreAdjustmentHeatRate(user))
    .filter(f => showCalculated ? !f.input && !f.noteFor : f.input || f.noteFor);
  const tableSections = [{ label: "", items: visibleFields }];
  const displayedRows = rows.slice(0, days);
  function monthlyTotal(field: Field) {
    if (!monthlyTotalCodes.has(field.code)) return null;
    const values = fieldSeries(field).map(point => point.value).filter((value): value is number => value !== null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  const daysWithData = rows.slice(0, days).filter(row => Object.values(row).some(Boolean)).length;
  const abnormalCount = rows.slice(0, days).reduce((sum, _row, day) => sum + Number(isWaterAbnormal(rows, day, "CE")) + Number(isWaterAbnormal(rows, day, "CF")), 0);
  function update(day:number, code:string, value:string){ if(!canEditDate(`${period}-${String(day+1).padStart(2,"0")}`)||!canEditDailyInput(user,code))return; if(numericCodes.has(code) && value!=="" && !/^-?\d*(?:[.,]\d*)?$/.test(value)) return; setRows(old=>old.map((r,i)=>i===day?{...r,[code]:value}:r)); markDirty(`${day}:${code.endsWith("_NOTE")?code.slice(0,-5):code}`); setMessage(""); }
  function openNote(day:number, field:Field){ if(!canEditDailyInput(user,field.code))return; if(!canEditDate(`${period}-${String(day+1).padStart(2,"0")}`))return; setNoteCell({day,code:field.code,label:field.label}); setNoteDraft(rows[day][`${field.code}_NOTE`]||""); }
  function applyNote(){ if(!noteCell)return; update(noteCell.day,`${noteCell.code}_NOTE`,noteDraft.trim()); setNoteCell(null); setMessage("Đã cập nhật ghi chú trên bảng. Nhấn “Lưu thay đổi” để lưu vào hệ thống."); }
  function applyQlktSync(){
    if(!canSyncDaily){setError("Tài khoản chưa có quyền đồng bộ và nhập dữ liệu ngày.");return;}
    if(!pendingSync)return;
    if(!canEditDate(pendingSync.operatingDate)){setError("Chỉ được đồng bộ ngày D hoặc D-1; ngày cũ hơn chỉ admin/quản trị được chỉnh sửa.");return;}
    const day=Number(pendingSync.operatingDate.slice(8,10))-1;
    if(day<0||day>=days){setError("Ngày từ QLKT không thuộc tháng đang hiển thị.");return;}
    const selected=pendingSync.entries.filter(entry=>QLKT_DIRECT_DAILY_CODES.has(entry.fieldCode)&&canEditDailyInput(user,entry.fieldCode)&&selectedSyncCodes.has(entry.fieldCode));
    setRows(old=>old.map((row,index)=>index===day?{...row,...Object.fromEntries(selected.map(entry=>[entry.fieldCode,normalizeQlktValue(entry.value)]))}:row));
    selected.forEach(entry=>markDirty(`${day}:${entry.fieldCode}`));
    setPendingSync(null);
    setMessage(`Đã đưa ${selected.length} số liệu QLKT vào ngày ${day+1}. Kiểm tra bảng rồi nhấn “Lưu thay đổi”.`);
  }
  function syncFromQlkt(){
    setError("");setMessage("");
    if(!canSyncDaily){setError("Tài khoản chưa có quyền đồng bộ dữ liệu ngày từ QLKT.");return;}
    if(!canEditDate(syncDate)){setError("Không thể đồng bộ ngày tương lai hoặc ngày cũ hơn D-1 với tài khoản hiện tại.");return;}
    if(!extensionVersion||extensionOutdated){
      window.postMessage({channel:"ctktkt-qlkt-sync",sender:"ctktkt-web",type:"PING"},window.location.origin);setSyncHelp(true);
      setError(extensionOutdated?`Tiện ích v${extensionVersion} chưa Reload. Hãy mở trang tiện ích Chrome/Edge, nhấn Reload rồi Ctrl+F5 web; không cần tải lại nếu đang Load unpacked từ thư mục nguồn cố định.`:`Chưa kết nối tiện ích QLKT. Hãy Reload tiện ích; chỉ tải ZIP nếu tiện ích chưa được cài hoặc đang trỏ sai thư mục.`);return;
    }
    if(qlktRequestRef.current)window.clearTimeout(qlktRequestRef.current.timer);
    const requestId=crypto.randomUUID();
    const timer=window.setTimeout(()=>{if(qlktRequestRef.current?.id!==requestId)return;qlktRequestRef.current=null;setSyncingQlkt(false);setSyncProgress("");setError("QLKT phản hồi quá lâu. Hãy kiểm tra phiên đăng nhập QLKT rồi thử lại.");},360000);
    qlktRequestRef.current={id:requestId,timer};setSyncingQlkt(true);setSyncProgress("Đang đọc tồn kho 06h00, nước và thời gian vận hành từ QLKT…");
    window.postMessage({channel:"ctktkt-qlkt-sync",sender:"ctktkt-web",type:"SYNC_ALL",requestId,operatingDate:syncDate},window.location.origin);
  }
  async function syncQlktRange(){
    setError("");setMessage("");
    if(!canSyncDaily){setError("Tài khoản chưa có quyền đồng bộ dữ liệu ngày từ QLKT.");return;}
    if(!extensionVersion||extensionOutdated){setSyncHelp(true);setError("Chưa kết nối tiện ích QLKT hoặc tiện ích chưa Reload.");return;}
    if(dirty.current.size){setError("Bảng đang có thay đổi chưa lưu. Hãy lưu hoặc tải lại trang trước khi đồng bộ nhiều ngày.");return;}
    if(!canEditDate(rangeTo)){setError("Ngày kết thúc không được sau ngày D; chỉ admin/quản trị được đồng bộ các ngày cũ hơn D-1.");return;}
    const dates=listIsoDates(rangeFrom,rangeTo);
    if(!dates.length){setError("Khoảng ngày không hợp lệ (tối đa 400 ngày, từ ngày phải trước đến ngày).");return;}
    if(dates.some(date=>!canEditDate(date))){setError("Tài khoản hiện tại không được đồng bộ các ngày trước D-1; chỉ admin/quản trị được chỉnh sửa ngày cũ.");return;}
    rangeStopRef.current=false;
    let wakeLock:{release:()=>Promise<void>}|null=null;
    try{wakeLock=await (navigator as Navigator&{wakeLock?:{request:(type:"screen")=>Promise<{release:()=>Promise<void>}>}}).wakeLock?.request("screen")??null;}catch{wakeLock=null;}
    const notesByPeriod=new Map<string,Map<string,string>>();
    const failed:string[]=[];let saved=0;
    setRangeState({running:true,done:0,total:dates.length,saved:0,current:dates[0],failed:[]});
    for(const [index,date] of dates.entries()){
      if(rangeStopRef.current)break;
      setRangeState(state=>state&&{...state,current:date});
      const result=await requestQlktDay(date);
      const payload=result.ok?validateQlktSyncPayload(result.payload):null;
      if(!payload||payload.operatingDate!==date){failed.push(`${displayDate(date)}: ${result.error||"dữ liệu chưa đủ hoặc sai ngày"}`);}
      else{
        const monthKey=date.slice(0,7);
        try{
          if(!notesByPeriod.has(monthKey)){
            const response=await ctktktRequest(`/api/ctktkt/daily-inputs?period=${monthKey}`,{cache:"no-store"});
            const body=await response.json() as {entries?:LoadedEntry[];error?:string};
            if(!response.ok)throw new Error(body.error||"không đọc được ghi chú hiện có");
            notesByPeriod.set(monthKey,new Map((body.entries||[]).filter(entry=>entry.note).map(entry=>[`${entry.operatingDate}|${entry.fieldCode}`,entry.note])));
          }
          const entries=buildQlktRangeEntries(date,directQlktPayload(payload).entries.filter(entry=>canEditDailyInput(user,entry.fieldCode)).map(entry=>({fieldCode:entry.fieldCode,value:normalizeQlktValue(entry.value)})),notesByPeriod.get(monthKey)!);
          if(entries.length){
            const response=await ctktktRequest("/api/ctktkt/daily-inputs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({period:monthKey,entries})});
            const body=await response.json() as {error?:string};
            if(!response.ok)throw new Error(body.error||"không lưu được");
            saved+=entries.length;
          }
        }catch(reason){failed.push(`${displayDate(date)}: ${reason instanceof Error?reason.message:"không lưu được"}`);}
      }
      const savedSnapshot = saved;
      const failedSnapshot = [...failed];
      setRangeState(state=>state&&{...state,done:index+1,saved:savedSnapshot,failed:failedSnapshot});
    }
    try{await wakeLock?.release();}catch{}
    setRangeState(state=>state&&{...state,running:false});
    setReloadKey(key=>key+1);
    setMessage(`${rangeStopRef.current?"Đã dừng":"Đã xong"} đồng bộ QLKT ${displayDate(rangeFrom)}–${displayDate(rangeTo)}: lưu ${saved} ô${failed.length?`, ${failed.length} ngày lỗi (xem danh sách bên dưới, có thể chạy lại riêng các ngày đó)`:""}.`);
  }
  function noteButton(day:number, field:Field){ const hasNote=Boolean(rows[day][`${field.code}_NOTE`]?.trim()); return <button type="button" onClick={event=>{event.stopPropagation();openNote(day,field);}} aria-label={`${hasNote?"Xem hoặc sửa":"Thêm"} ghi chú cho ${field.label}, ngày ${day+1}`} title={hasNote?rows[day][`${field.code}_NOTE`]:"Thêm ghi chú"} className={`absolute right-0 top-0 z-10 h-4 w-4 ${hasNote?"opacity-100":"opacity-0 group-hover:opacity-100 focus:opacity-100"}`}><span className={`absolute right-0 top-0 h-0 w-0 border-l-[10px] border-l-transparent ${hasNote?"border-t-[10px] border-t-orange-500":"border-t-[10px] border-t-slate-300"}`}/></button>; }
  async function save(){ setError(""); setMessage(""); const entries=[...dirty.current].map(key=>{const [dayText,code]=key.split(":"); const day=Number(dayText); return {operatingDate:`${period}-${String(day+1).padStart(2,"0")}`,fieldCode:code,value:rows[day][code]||"",note:rows[day][`${code}_NOTE`]||""};});
    if(!entries.length){setMessage("Không có thay đổi mới để lưu."); return;} setSaving(true); try{const r=await ctktktRequest("/api/ctktkt/daily-inputs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({period,entries})}); const b=await r.json() as {error?:string;saved?:number}; if(!r.ok)throw new Error(b.error||"Chưa lưu được dữ liệu."); dirty.current.clear(); setDirtyCount(0); setMessage(`Đã lưu ${b.saved||entries.length} ô dữ liệu.`);} catch(e){setError(e instanceof Error?e.message:"Chưa lưu được dữ liệu.");} finally{setSaving(false);} }

  const overviewFields = visibleFields.filter(field => field.code !== "CW" && !field.noteFor);
  const overviewField = overviewFields.find(field => field.code === overviewCode) ?? overviewFields[0];

  return <section className="monthly-workspace space-y-5">
    <div className="monthly-heading monthly-controls-compact">
      <div className="monthly-period-controls"><label className="grid gap-1 text-xs font-bold text-slate-600">THÁNG<MonthField max={today.slice(0,7)} value={period} onChange={e=>setPeriod(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm" /></label><label className="grid gap-1 text-xs font-bold text-slate-600">NGÀY ĐỒNG BỘ<DateField max={today} value={syncDate} onChange={setSyncDate} className="w-[150px]"/></label></div>
    <div className="monthly-stats grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[{icon:CalendarDays,label:"Ngày trong tháng",value:days,tone:"text-[#4057b5] bg-[#f0f3ff]"},{icon:CheckCircle2,label:"Ngày đã nhập",value:daysWithData,tone:"text-[#19845f] bg-[#edf9f4]"},{icon:PencilLine,label:"Ô vừa thay đổi",value:dirtyCount,tone:"text-[#c87819] bg-[#fff7e8]"},{icon:TriangleAlert,label:"CE/CF bất thường",value:abnormalCount,tone:abnormalCount?"text-red-700 bg-red-50":"text-[#7451d6] bg-[#f5f1ff]"}].map(card=><div key={card.label} className="monthly-stat"><span className={`monthly-stat-icon ${card.tone}`}><card.icon className="size-5" aria-hidden /></span><div><p className="text-3xl font-bold leading-none text-slate-900">{loading?"…":card.value}</p><p className="mt-2 text-sm text-slate-500">{card.label}</p></div></div>)}
    </div>
      <div className="monthly-actions"><div className="monthly-sync-control"><button type="button" disabled={syncingQlkt||!canSyncDaily||!canEditDate(syncDate)} title={!canSyncDaily?"Tài khoản chưa có quyền đồng bộ dữ liệu ngày.":!canEditDate(syncDate)?"Đồng bộ ngày D hoặc D-1; ngày cũ hơn chỉ admin/quản trị được chỉnh sửa.":extensionOutdated?`Reload tiện ích QLKT ${REQUIRED_QLKT_EXTENSION_VERSION}`:"Đọc dữ liệu chỉ tiêu ngày từ QLKT"} onClick={syncFromQlkt} className="monthly-sync-button h-10 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 disabled:cursor-wait disabled:opacity-60">{syncingQlkt?"Đang đồng bộ…":extensionOutdated?`↻ Reload tiện ích ${REQUIRED_QLKT_EXTENSION_VERSION}`:"⚡ Đồng bộ dữ liệu ngày"}</button><p className="monthly-sync-notice">Tài khoản có quyền được nhập ngày D và D-1. Ngày trước D-1 chỉ admin/quản trị được chỉnh sửa; ngày tương lai luôn bị khóa.</p></div><button disabled={saving||loading||isViewer} title={isViewer?"Tài khoản Chỉ xem không có quyền lưu dữ liệu.":undefined} onClick={save} className="monthly-save-button flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-50"><Save className="size-4" aria-hidden />{saving?"Đang lưu…":"Lưu thay đổi"}</button><p className={`w-full text-right text-[11px] font-semibold ${extensionOutdated?"text-red-700":extensionVersion?"text-emerald-700":"text-amber-700"}`}>{syncProgress|| (extensionOutdated?`Tiện ích v${extensionVersion} chưa Reload — nguồn hiện tại ${REQUIRED_QLKT_EXTENSION_VERSION}`:extensionVersion?`Tiện ích v${extensionVersion} đã kết nối`:"Chưa kết nối tiện ích")}</p></div>
    </div>

    <MonthlyHeaderAlert items={monthlyMissing} loading={loading} scope={`tháng ${period.slice(5, 7)}/${period.slice(0, 4)}`} defaultExpanded={false} />

    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{error}</p>}{message&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">{message}</p>}

    <Tabs value={group} onValueChange={v=>{setGroup(v as Group);setShowCalculated(false);}} className="monthly-data-panel gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="monthly-table-heading"><div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Activity className="size-4 text-blue-600" aria-hidden />Bảng số liệu vận hành</h3><p className="mt-1 text-xs text-slate-500">Chọn nhóm chỉ tiêu và chế độ hiển thị bên dưới</p></div><span className="monthly-chart-hint"><BarChart3 className="size-4" aria-hidden />Bấm tên chỉ tiêu để xem biểu đồ</span></div><div className="monthly-table-filters flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <TabsList className="monthly-group-tabs h-auto max-w-full flex-wrap justify-start gap-1 bg-transparent p-0">{groups.map(g=><TabsTrigger key={g.key} value={g.key} className="rounded-lg px-3 py-2 text-xs font-bold sm:text-sm">{g.label}</TabsTrigger>)}</TabsList>
        <div className="monthly-mode-switch flex rounded-lg bg-slate-100 p-1"><button aria-pressed={!showCalculated} onClick={()=>setShowCalculated(false)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${!showCalculated?"bg-white text-[#354a9f] shadow-sm":"text-slate-500"}`}>Nhập liệu</button><button aria-pressed={showCalculated} onClick={()=>setShowCalculated(true)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${showCalculated?"bg-white text-[#354a9f] shadow-sm":"text-slate-500"}`}>Kết quả tính</button></div>
      </div>
      <div className="monthly-table-description border-b border-slate-100 px-4 py-2.5"><p className="flex items-center gap-2 text-xs text-slate-500"><Info className="size-3.5 shrink-0" aria-hidden />{groups.find(g=>g.key===group)?.description} · Hiển thị đầy đủ {days} ngày trong tháng.</p></div>
      {groups.map(g=><TabsContent key={g.key} value={g.key} className="report-data-table-scope mt-0">
        {visibleFields.length===0?<div className="grid h-80 place-items-center text-sm text-slate-500">Nhóm này không có cột công thức riêng.</div>:<div>{tableSections.map(section=><div key="main"><Table className="monthly-grid w-full table-fixed text-xs" style={{minWidth:0}}><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-16 w-10 border-r bg-[#dcebf5] px-0.5 text-center text-[10px] font-extrabold leading-tight text-[#173b64]">Ngày</TableHead>{section.items.map(f=><TableHead key={f.code} className="h-16 whitespace-normal break-words border-r bg-[#dcebf5] px-0.5 text-center text-[10px] font-extrabold leading-[1.15] text-[#173b64]">{f.code==="CW"?<>{f.label}</>:<button type="button" onClick={()=>setChartField(f)} title={`Xem biểu đồ ${f.label} cả tháng`} className="w-full rounded px-0.5 py-0.5 decoration-dotted underline-offset-2 hover:bg-white/50 hover:underline focus:bg-white/50 focus:underline focus:outline-none">{f.label}{f.unit&&<span className="mt-0.5 block text-[9px] font-semibold text-[#173b64]">{f.unit}</span>}</button>}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{displayedRows.map((row,d)=>{const result=calculateDailyProduction(row);return <TableRow key={d} className="h-9 hover:bg-[#f5faff]"><TableCell className="border-r bg-white p-0.5 text-center text-[11px] font-normal text-black">{d+1}</TableCell>{section.items.map(f=>{
            const cellKey=`${d}:${f.code}`;
            if(f.input){const isLinked=ctktktLinkedCells.has(cellKey), canEdit=canEditDate(`${period}-${String(d+1).padStart(2,"0")}`)&&canEditDailyInput(user,f.code);return <TableCell key={f.code} onClick={()=>selectCell(cellKey)} title={!canEditMonthlyInputs?"Tài khoản chưa được cấp quyền nhập dữ liệu ngày.":!canEdit?"Ngày tương lai luôn bị khóa; ngày cũ hơn D-1 chỉ admin/quản trị được sửa":isLinked?"Tự liên kết từ Báo cáo chỉ tiêu KTKT":undefined} className={`group relative border-r p-0 ${isLinked?"bg-emerald-50":cellBg(cellKey)}`}>{canEdit&&noteButton(d,f)}<input disabled={isLinked||!canEdit} aria-label={`${f.label}, ngày ${d+1}`} inputMode={f.code==="CW"?"text":"decimal"} value={focusedCell===cellKey?(row[f.code]||""):formatInputValue(row[f.code])} onFocus={()=>setFocusedCell(cellKey)} onBlur={()=>setFocusedCell("")} onChange={e=>update(d,f.code,e.target.value)} style={{fontSize:"0.9375rem",fontWeight:700}} className={`h-8 w-full bg-transparent px-1 text-center text-xs font-semibold tabular-nums text-black outline-none focus:ring-2 focus:ring-inset focus:ring-[#4c78a8] disabled:cursor-not-allowed disabled:text-emerald-800 ${!isLinked&&canEdit?"ring-1 ring-inset ring-sky-600":""}`}/></TableCell>;}
            return <TableCell key={f.code} onClick={()=>selectCell(cellKey)} className={`group relative cursor-pointer border-r px-0.5 text-center text-[11px] font-normal tabular-nums text-black ${cellBg(cellKey)}`}>{noteButton(d,f)}{formatResult(result[f.code]??null)}</TableCell>})}</TableRow>})}</TableBody><TableFooter><TableRow className="h-10 bg-[#dcebf5] hover:bg-[#dcebf5]"><TableCell className="border-r px-1 text-center text-[10px] font-extrabold text-[#173b64]">Tổng tháng</TableCell>{section.items.map(field=><TableCell key={field.code} className="border-r px-1 text-center text-[11px] font-extrabold tabular-nums text-[#173b64]">{monthlyTotalCodes.has(field.code)?formatResult(monthlyTotal(field)):"—"}</TableCell>)}</TableRow></TableFooter></Table></div>)}</div>}
        <div className="monthly-table-legend flex min-h-10 flex-wrap items-center justify-between gap-2 border-t bg-white px-4 py-3 text-xs text-slate-600"><span className="flex flex-wrap items-center gap-4"><span><i className="monthly-legend-dot bg-white" />Ô nhập số liệu</span><span><i className="monthly-legend-dot bg-emerald-50" />Ô liên kết / chỉ đọc</span><span><i className="monthly-legend-dot bg-orange-400" />Có ghi chú</span></span>{g.key==="environment"&&<span className="font-semibold text-amber-800">CE/CF tăng &gt;30% và ≥100 m³: chỉ cảnh báo, không chặn lưu</span>}</div>
      </TabsContent>)}
    </Tabs>
    {overviewField && <div className="monthly-overview">
      <div className="monthly-overview-header">
        <div><p className="monthly-eyebrow">Theo dõi diễn biến</p><h3 className="mt-1 text-xl font-bold text-slate-900">{overviewField.label} <span className="text-sm font-normal text-slate-500">{overviewField.unit ? `(${overviewField.unit})` : ""}</span></h3><p className="mt-1 text-xs text-slate-500">Tháng {period.slice(5,7)}/{period.slice(0,4)} · {showCalculated ? "Kết quả tính" : "Số liệu trong bảng"}</p></div>
        <div className="flex flex-wrap items-center gap-2"><label className="monthly-overview-select"><span>Chỉ tiêu biểu đồ</span><select aria-label="Chỉ tiêu biểu đồ" value={overviewField.code} onChange={event => setOverviewCode(event.target.value)}>{overviewFields.map(field => <option key={field.code} value={field.code}>{field.label}</option>)}</select></label><button type="button" onClick={() => setChartField(overviewField)} className="monthly-detail-button"><BarChart3 className="size-4" aria-hidden />Xem chi tiết</button></div>
      </div>
      <div className="monthly-overview-canvas">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={fieldSeries(overviewField)} margin={{top:12,right:20,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 5" stroke="#dde7f0" vertical={false}/><XAxis dataKey="day" tick={{fontSize:11,fill:"#64748b"}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:"#64748b"}} width={64} domain={seriesDomain(overviewField)} allowDataOverflow axisLine={false} tickLine={false}/><Tooltip contentStyle={{borderRadius:12,borderColor:"#dbe4ef"}} formatter={(value:unknown)=>formatResult(typeof value==="number"?value:null)} labelFormatter={label=>`Ngày ${label}`}/><Line type="monotone" dataKey="value" name={overviewField.label} stroke="#1686a0" strokeWidth={3} dot={{r:3,fill:"#fff",strokeWidth:2}} connectNulls/></LineChart></ResponsiveContainer>
      </div>
      <div className="monthly-overview-footer"><span><i className="monthly-series-dot" />{overviewField.label}</span><span>Ô không có số liệu giữ trống · Bấm tên cột trong bảng để xem từng chỉ tiêu</span></div>
    </div>}
    {canSyncDaily&&<details className="monthly-range"><summary className="monthly-range-summary"><RefreshCw className="size-4 text-blue-600" aria-hidden /><span className="flex-1"><span className="block font-bold text-slate-800">Đồng bộ QLKT nhiều ngày</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Mở thiết lập khoảng ngày và theo dõi tiến độ đồng bộ</span></span><ChevronDown className="monthly-range-chevron size-4 text-slate-400" aria-hidden /></summary><div className="monthly-range-controls flex flex-wrap items-end gap-3">
      <div className="mr-auto"><p className="text-xs font-bold text-[#173b64]">Đồng bộ QLKT nhiều ngày</p><p className="text-[11px] text-slate-500">Giờ phát, thời gian vận hành, nhận lưới S1/S2, tồn kho 06h00, nước bổ sung · tự lưu từng ngày · cần mở và đăng nhập QLKT, giữ tab này mở</p></div>
      <label className="grid gap-1 text-xs font-bold text-slate-600">TỪ NGÀY<DateField max={today} value={rangeFrom} onChange={setRangeFrom} className="w-[150px]"/></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">ĐẾN NGÀY<DateField max={today} value={rangeTo} onChange={setRangeTo} className="w-[150px]"/></label>
      {rangeState?.running
        ?<button type="button" onClick={()=>{rangeStopRef.current=true;}} className="h-10 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700">■ Dừng</button>
        :<button type="button" disabled={syncingQlkt} onClick={syncQlktRange} className="h-10 rounded-xl bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-4 text-sm font-bold text-white shadow-md disabled:opacity-60">⚡ Đồng bộ khoảng ngày</button>}
      {rangeState&&<div className="w-full text-[11px] text-slate-600">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#438ec1]" style={{width:`${rangeState.total?Math.round(rangeState.done/rangeState.total*100):0}%`}}/></div>
        <p className="mt-1">{rangeState.running?`Đang đọc ngày ${displayDate(rangeState.current)} · `:""}{rangeState.done}/{rangeState.total} ngày · đã lưu {rangeState.saved} ô{rangeState.failed.length?` · ${rangeState.failed.length} ngày lỗi`:""}</p>
        {rangeState.failed.length>0&&<details className="mt-1"><summary className="cursor-pointer font-semibold text-amber-800">Ngày lỗi</summary><ul className="mt-1 max-h-32 list-disc overflow-auto pl-5">{rangeState.failed.map(item=><li key={item}>{item}</li>)}</ul></details>}
      </div>}
    </div></details>}

    <DialogPrimitive.Root open={Boolean(noteCell)} onOpenChange={open=>{if(!open)setNoteCell(null);}}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"><div className="space-y-1"><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Ghi chú số liệu</DialogPrimitive.Title><DialogPrimitive.Description className="text-sm text-slate-600">{noteCell?`${noteCell.label} · ngày ${noteCell.day+1}/${period.slice(5,7)}/${period.slice(0,4)}`:""}</DialogPrimitive.Description></div><label className="grid gap-2 text-sm font-semibold text-slate-700">Nguyên nhân hoặc nội dung cần lưu ý<textarea autoFocus rows={5} maxLength={500} value={noteDraft} onChange={event=>setNoteDraft(event.target.value)} placeholder="Ví dụ: Tổ máy giảm tải do xử lý thiết bị…" className="resize-none rounded-xl border border-slate-300 bg-white p-3 font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-2 focus:ring-[#4c78a8]/20"/></label><p className="text-xs text-slate-500">Ô có ghi chú sẽ được đánh dấu bằng góc màu cam. Xóa hết nội dung để xóa ghi chú.</p><div className="flex justify-end gap-2"><button type="button" onClick={()=>setNoteCell(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Hủy</button><button type="button" onClick={applyNote} className="rounded-lg bg-[#334785] px-4 py-2 text-sm font-semibold text-white">Áp dụng ghi chú</button></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
    <DialogPrimitive.Root open={Boolean(chartField)} onOpenChange={open=>{if(!open)setChartField(null);}}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/><DialogPrimitive.Content className="monthly-chart-dialog fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"><div className="monthly-chart-title space-y-1"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600"><BarChart3 className="size-4" aria-hidden />Xu hướng trong tháng</p><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">{chartField?.label}{chartField?.unit?` (${chartField.unit})`:""}</DialogPrimitive.Title><DialogPrimitive.Description className="text-sm text-slate-600">Diễn biến các ngày trong tháng {period.slice(5,7)}/{period.slice(0,4)}</DialogPrimitive.Description></div><div className="monthly-chart-canvas h-80">{chartField&&<ResponsiveContainer width="100%" height="100%"><LineChart data={fieldSeries(chartField)} margin={{top:8,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f2"/><XAxis dataKey="day" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} width={56} domain={seriesDomain(chartField)} allowDataOverflow/><Tooltip contentStyle={{borderRadius:12,borderColor:"#dbe4ef",boxShadow:"0 8px 24px rgb(30 58 90 / 10%)"}} formatter={(value:unknown)=>formatResult(typeof value==="number"?value:null)} labelFormatter={label=>`Ngày ${label}`}/><Line type="monotone" dataKey="value" name={chartField.label} stroke="#2563eb" strokeWidth={2.5} dot={{r:3,fill:"#fff",strokeWidth:2}} connectNulls/></LineChart></ResponsiveContainer>}</div><div className="flex justify-end"><button type="button" onClick={()=>setChartField(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Đóng</button></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
    <DialogPrimitive.Root open={syncHelp} onOpenChange={setSyncHelp}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Reload tiện ích QLKT {REQUIRED_QLKT_EXTENSION_VERSION}</DialogPrimitive.Title><DialogPrimitive.Description className="text-sm leading-6 text-slate-600">Nếu tiện ích được cài bằng Load unpacked từ thư mục nguồn cố định, mỗi lần nâng cấp chỉ cần mở trang quản lý tiện ích Chrome/Edge và nhấn Reload, sau đó Ctrl+F5 web. Chỉ tải ZIP và Load unpacked lại khi tiện ích đang trỏ tới thư mục giải nén cũ hoặc thư mục nguồn không còn được cập nhật.</DialogPrimitive.Description><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-[#274f78]"><p className="font-bold">Ưu tiên Reload — không cần tải lại mỗi lần.</p><p className="mt-1">Sau khi Reload, bấm nút kiểm tra lại để web nhận đúng phiên bản mới.</p></div><div className="flex flex-wrap justify-end gap-2"><a href={QLKT_EXTENSION_DOWNLOAD_URL} download={`qlkt-sync-extension-${REQUIRED_QLKT_EXTENSION_VERSION}.zip`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Tải ZIP dự phòng</a><button type="button" onClick={()=>window.location.reload()} className="rounded-lg bg-[#334785] px-4 py-2 text-sm font-semibold text-white">Đã Reload — kiểm tra lại</button></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
    <DialogPrimitive.Root open={Boolean(pendingSync)} onOpenChange={open=>{if(!open)setPendingSync(null);}}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45"/><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[86vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none"><div><DialogPrimitive.Title className="text-lg font-bold text-[#173b64]">Kiểm tra dữ liệu từ QLKT</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-slate-600">Ngày {pendingSync?pendingSync.operatingDate.split("-").reverse().join("/"):""}. Bỏ chọn chỉ tiêu chưa muốn cập nhật.</DialogPrimitive.Description></div><div className="overflow-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead><tr className="bg-[#dcebf5] text-[#173b64]"><th className="w-10 p-2 text-center">Chọn</th><th className="p-2 text-left">Chỉ tiêu</th><th className="p-2 text-center">Đang có</th><th className="p-2 text-center">Từ QLKT</th></tr></thead><tbody>{pendingSync?.entries.map(entry=>{const day=Number(pendingSync.operatingDate.slice(8,10))-1;return <tr key={entry.fieldCode} className="border-t"><td className="p-2 text-center"><input type="checkbox" disabled={!canEditDailyInput(user,entry.fieldCode)} checked={canEditDailyInput(user,entry.fieldCode)&&selectedSyncCodes.has(entry.fieldCode)} onChange={event=>setSelectedSyncCodes(old=>{const next=new Set(old);if(event.target.checked)next.add(entry.fieldCode);else next.delete(entry.fieldCode);return next;})} aria-label={`Chọn ${qlktFieldLabels[entry.fieldCode]}`}/></td><td className="p-2"><p className="font-semibold text-black">{qlktFieldLabels[entry.fieldCode]}</p><p className="text-xs text-slate-500">{entry.sourceLabel}</p></td><td className="p-2 text-center tabular-nums text-black">{formatInputValue(rows[day]?.[entry.fieldCode])||"—"}</td><td className="p-2 text-center font-bold tabular-nums text-[#173b64]">{formatInputValue(entry.value)}</td></tr>})}</tbody></table></div><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Chưa ghi vào kho dữ liệu cho đến khi bạn nhấn “Lưu thay đổi”.</p><div className="flex gap-2"><button type="button" onClick={()=>setPendingSync(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Hủy</button><button type="button" disabled={loading||!canSyncDaily||!pendingSync?.entries.some(entry=>canEditDailyInput(user,entry.fieldCode)&&selectedSyncCodes.has(entry.fieldCode))} onClick={applyQlktSync} className="rounded-lg bg-[#334785] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Đưa vào bảng</button></div></div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
  </section>;
}
