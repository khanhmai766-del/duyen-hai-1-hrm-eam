"use client";
import { ctktktMetricDisplay } from "../lib/ctktkt-report";
import "./ctktkt-report-compact.css";
import {ReportCorrections} from "./report-corrections";
import { useCtktktRequest, useCtktktDownload } from "@/hooks/useCtktkt";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  Save,
  Search,
  Zap,
  Flame,
  Droplets,
  Boxes,
  Power,
  FileText,
  Lock,
  ChevronDown,
  ChevronUp,
  UserCheck,
  RefreshCw,
  Mail,
  Camera,
} from "lucide-react";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import {saveReviewedCoalEntries} from "@/modules/ctktkt/lib/coal-photo-save";
const CtktktEmailModal=dynamic(()=>import("@/modules/ctktkt/components/ctktkt-email-modal").then(module=>module.CtktktEmailModal),{ssr:false});
const CoalMeterPhotoImport=dynamic(()=>import("@/modules/ctktkt/components/coal-meter-photo-import").then(module=>module.CoalMeterPhotoImport),{ssr:false});
import { calculateCoalStock24h, calculatePmisCoalStockOpening, COAL_STOCK_24H_START_CELL } from "@/modules/ctktkt/lib/coal-stock";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { canEditOperatingDate, defaultOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import {
  canEditAnyCtktktField,
  canEditCtktktField,
  canEditCtktktGroup,
  getEditableCtktktGroups,
  getCtktktFieldGroup,
  CTKTKT_GROUP_META,
  type CtktktFieldGroup,
} from "@/modules/ctktkt/lib/ctktkt-permissions";
import { CTKTKT_BCSX_LINKED_CELLS } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { CTKTKT_WATER_LINKED_CELLS } from "@/modules/ctktkt/lib/ctktkt-water-link";
import {
  calculateCtktktSummary,
  calculateCtktktMeterSummary,
  calculateTkdDcsSummary,
  calculateOilDifferences,
  calculateSteamDifferences,
  calculateNh3Summary,
  calculateNh3DcsSummary,
  calculateCoalShiftDetails,
  calculateCoalMeterShiftConsumption,
  applyNh3StartLevelCarryover,
  NH3_DCS_START_METER_CELLS,
  NH3_START_LEVEL_CELLS,
  NH3_OPENING_STOCK_CELL,
  previousIsoDate,
  TKD_HOURS,
  OIL_HOURS,
  STEAM_HOURS,
  type CtktktDayEntries,
  type CtktktKpis,
} from "@/modules/ctktkt/lib/ctktkt-report";
import { parseLocaleNumber } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { CTKTKT_INPUT_FIELDS } from "@/modules/ctktkt/lib/ctktkt-fields.generated";
import {
  CTKTKT_EXTRA_INPUT_FIELDS,
  CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS,
  normalizeCtktktInputValue,
} from "@/modules/ctktkt/lib/ctktkt-extra-fields";
import { parseSpreadsheetClipboard } from "@/modules/ctktkt/lib/spreadsheet-grid";
import { CTKTKT_INSTALLED_CAPACITY_CELL, CTKTKT_INSTALLED_CAPACITY_MW } from "@/modules/ctktkt/lib/ctktkt-defaults";
import { isQlktExtensionOutdated } from "@/modules/ctktkt/lib/qlkt-extension-version";
import {
  PMIS_PRODUCTION_CELLS,
  sanitizeCtktktPmisSyncEntries,
} from "@/modules/ctktkt/lib/ctktkt-pmis-sync";
import {
  calculateCtktktOperationEventOil,
  createCtktktOperationEvent,
  CTKTKT_EVENT_POWER_ROWS,
  CTKTKT_OPERATION_EVENTS_CELL,
  CTKTKT_OPERATION_ELECTRICAL_POINTS,
  CTKTKT_OPERATION_POINT_LABELS,
  ctktktOperationEventId,
  ctktktOperationOilCells,
  ctktktOperationPowerColumn,
  isCtktktOperationPowerCell,
  parseCtktktOperationEvents,
  type CtktktOperationEvent,
  type CtktktOperationKind,
  type CtktktOperationPoint,
  type CtktktOperationUnit,
} from "@/modules/ctktkt/lib/ctktkt-operation-events";
import { isMissingValue, describeCtktktMissingField } from "@/modules/ctktkt/lib/data-completeness";
import { shouldShowCtktktMissingField } from "@/modules/ctktkt/lib/ctktkt-missing-fields";
import { ExportMissingDialog } from "@/modules/ctktkt/components/export-missing-dialog";
import type { MissingDataItem } from "@/modules/ctktkt/components/missing-data-alert";

type LoadedEntry = { operatingDate: string; cell: string; value: string };
type LinkWarning = { operatingDate: string; cell: string; message: string };

type MainTab =
  | "tkd_dcs"
  | "unit_meters"
  | "steam_nh3"
  | "td21_coal_blend"
  | "startup_shutdown"
  | "pmis_reports"
  | "all_fields";

const LEGACY_OPERATION_EVENT_CELLS = new Set([
  "STARTUP_UNIT", "STARTUP_EVENT", "STARTUP_OIL_START_TIME", "STARTUP_GRID_SYNC_TIME", "STARTUP_MIN_LOAD_TIME", "STARTUP_MIN_LOAD_MW",
  "C87", "D87", "E87", "F87", "G87", "H87", "C88", "D88", "E88", "F88", "G88", "H88",
  "C93", "D93", "E93", "F93", "G93", "H93", "C94", "D94", "E94", "F94", "G94", "H94",
]);

const STARTUP_UNITS: Array<{ value: CtktktOperationUnit; label: string }> = [
  { value: "S1", label: "Tổ máy S1" },
  { value: "S2", label: "Tổ máy S2" },
];

const OPERATION_KINDS: Array<{ value: CtktktOperationKind; label: string }> = [
  { value: "startup", label: "Khởi động" },
  { value: "shutdown", label: "Ngừng tổ máy" },
  { value: "incident_oil", label: "Đốt dầu sự cố" },
];

const QLKT_PRODUCTION_CELLS = new Set<string>(PMIS_PRODUCTION_CELLS);

const editableFields = [
  ...CTKTKT_INPUT_FIELDS.filter(
    field => !CTKTKT_BCSX_LINKED_CELLS.has(field.cell)
      && !CTKTKT_WATER_LINKED_CELLS.has(field.cell)
      && !NH3_DCS_START_METER_CELLS.has(field.cell)
      && !CTKTKT_LEGACY_UNUSED_COAL_BLEND_CELLS.has(field.cell),
  ),
  ...CTKTKT_EXTRA_INPUT_FIELDS,
].filter(field => field.cell !== CTKTKT_OPERATION_EVENTS_CELL
  && !LEGACY_OPERATION_EVENT_CELLS.has(field.cell)
  && !isCtktktOperationPowerCell(field.cell)
  && describeCtktktMissingField(field) !== null);

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });

function reportTabClass(active: boolean) {
  return `flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-[13px] font-bold leading-snug transition-all ${
    active
      ? "border-[#765038] bg-[#8a6247] text-white shadow-sm"
      : "border-[#d9c3ad] bg-[#f4eadf] text-[#68462e] hover:border-[#b99472] hover:bg-[#ead9c8]"
  }`;
}

const metricRows: Array<{ key: keyof CtktktKpis; label: string; unit: string }> = [
  { key: "grossMwh", label: "Điện đầu cực", unit: "MWh" },
  { key: "netMwh", label: "Điện giao", unit: "MWh" },
  { key: "auxiliaryMwh", label: "Điện tự dùng", unit: "MWh" },
  { key: "auxiliaryPercent", label: "Tỷ lệ tự dùng gồm tổn thất MBA", unit: "%" },
  { key: "rawCoalTonnes", label: "Than chưa quy ẩm", unit: "tấn" },
  { key: "adjustedCoalTonnes", label: "Than quy ẩm 8,5%", unit: "tấn" },
  { key: "hhvKjKg", label: "Nhiệt trị than quy ẩm 8,5%", unit: "kJ/kg" },
  { key: "netCoalRate", label: "Suất hao than tinh", unit: "g/kWh" },
  { key: "netHeatRate", label: "Suất hao nhiệt tinh", unit: "kJ/kWh" },
];

const meterComparisonKeys = new Set<keyof CtktktKpis>([
  "grossMwh",
  "netMwh",
  "auxiliaryMwh",
  "auxiliaryPercent",
  "rawCoalTonnes",
  "hhvKjKg",
  "adjustedCoalTonnes",
  "netCoalRate",
  "netHeatRate",
]);

function format(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return numberFormat.format(value);
}

function coalConsumptionCellClass(value: number | null, total = false) {
  if (value !== null && value < 0) return "bg-red-50 text-red-700 font-black";
  return total ? "bg-blue-50 text-blue-950 font-black" : "bg-sky-50/60 text-slate-900 font-bold";
}

function parseDeminNum(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const cleaned = val.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatDeminDiff(
  xVal: string | undefined,
  wVal: string | undefined,
  adjVal?: string | undefined,
): string {
  const x = parseDeminNum(xVal);
  const w = parseDeminNum(wVal);
  const adj = parseDeminNum(adjVal) ?? 0;
  if (x === null || w === null) return "—";
  return numberFormat.format(x - w + adj);
}

function formatDeminTotal(
  x1: string | undefined,
  w1: string | undefined,
  adj1: string | undefined,
  x2: string | undefined,
  w2: string | undefined,
  adj2: string | undefined,
): string {
  const nx1 = parseDeminNum(x1);
  const nw1 = parseDeminNum(w1);
  const nadj1 = parseDeminNum(adj1) ?? 0;
  const nx2 = parseDeminNum(x2);
  const nw2 = parseDeminNum(w2);
  const nadj2 = parseDeminNum(adj2) ?? 0;

  const diff1 = nx1 !== null && nw1 !== null ? nx1 - nw1 + nadj1 : null;
  const diff2 = nx2 !== null && nw2 !== null ? nx2 - nw2 + nadj2 : null;

  if (diff1 === null && diff2 === null) return "—";
  const total = (diff1 ?? 0) + (diff2 ?? 0);
  return numberFormat.format(total);
}

function formatAdjTotal(adj1: string | undefined, adj2: string | undefined): string {
  const a1 = parseDeminNum(adj1);
  const a2 = parseDeminNum(adj2);
  if (a1 === null && a2 === null) return "0";
  return numberFormat.format((a1 ?? 0) + (a2 ?? 0));
}

function formatResinTotal(z1: string | undefined, z2: string | undefined): string {
  const nz1 = parseDeminNum(z1);
  const nz2 = parseDeminNum(z2);
  if (nz1 === null && nz2 === null) return "—";
  const total = (nz1 ?? 0) + (nz2 ?? 0);
  return numberFormat.format(total);
}

function num(entries: CtktktDayEntries, cell: string): number | null {
  return parseLocaleNumber(entries[cell] || "");
}

export function CtktktReport() {
  const ctktktRequest = useCtktktRequest();
  const downloadReport=useCtktktDownload();

  const user = useSessionUser();
  const editableGroups = useMemo(() => getEditableCtktktGroups(user), [user]);

  const [date, setDate] = useState(defaultOperatingDate);
  const canEditSelectedDate = canEditOperatingDate(date, isAdminUser(user));
  const userCanEditAny = canEditAnyCtktktField(user) && canEditSelectedDate;
  const [byDate, setByDate] = useState<Record<string, CtktktDayEntries>>({});
  const [linkedByDate, setLinkedByDate] = useState<Record<string, CtktktDayEntries>>({});
  const [linkWarnings, setLinkWarnings] = useState<LinkWarning[]>([]);
  const [hoursMissingDates, setHoursMissingDates] = useState<string[]>([]);

  // Tab điều hướng chính theo đúng các cụm phân công vận hành
  const [activeTab, setActiveTab] = useState<MainTab>("tkd_dcs");
  const [unitView, setUnitView] = useState<"s1" | "s2" | "both">("s1");
  const [operationUnit, setOperationUnit] = useState<CtktktOperationUnit>("S1");
  const [operationKind, setOperationKind] = useState<CtktktOperationKind>("startup");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [extrasState,setExtrasState]=useState<"loading"|"ready"|"error">("loading");
  const [reloadVersion,setReloadVersion]=useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [isKpiCollapsed, setIsKpiCollapsed] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [exportMissingOpen, setExportMissingOpen] = useState(false);
  const [exportMissingItems, setExportMissingItems] = useState<MissingDataItem[]>([]);
  const [pendingReportOutput, setPendingReportOutput] = useState<"excel" | "email" | null>(null);
  const [coalPhotoOpen, setCoalPhotoOpenState] = useState(false);
  const [coalPhotoMounted,setCoalPhotoMounted]=useState(false);
  const setCoalPhotoOpen=(open:boolean)=>{if(open)setCoalPhotoMounted(true);setCoalPhotoOpenState(open);};
  const canEditCoalCell = useCallback((cell: string) => canEditSelectedDate && canEditCtktktField(user, cell), [user, canEditSelectedDate]);
  const [extensionVersion, setExtensionVersion] = useState("");
  const extensionOutdated = isQlktExtensionOutdated(extensionVersion);
  const [syncingPmis, setSyncingPmis] = useState(false);
  const pmisRequestRef = useRef<{ id: string; timer: number; operatingDate: string } | null>(null);
  const dirtyCellsRef = useRef(new Set<string>());

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    const guardReportNavigation = (event: MouseEvent) => {
      if (!dirty && !saving) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setError("Hãy lưu số liệu ngày đang nhập trước khi chuyển sang trang khác.");
    };
    document.addEventListener("click", guardReportNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener("click", guardReportNavigation, true);
    };
  }, [dirty, saving]);

  useEffect(() => {
    const channel = "ctktkt-qlkt-sync";
    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as {
        channel?: string;
        sender?: string;
        type?: string;
        version?: string;
        requestId?: string;
        result?: {
          ok?: boolean;
          payload?: unknown;
          error?: string;
        };
      };
      if (!data || data.channel !== channel || data.sender !== "ctktkt-extension") return;
      if (data.type === "READY") {
        setExtensionVersion(String(data.version || "đã kết nối"));
        return;
      }
      const request = pmisRequestRef.current;
      if (!request || data.requestId !== request.id) return;
      if (data.type !== "SYNC_PMIS_02PD_RESULT") return;
      window.clearTimeout(request.timer);
      if (!data.result?.ok || !data.result.payload) {
        pmisRequestRef.current = null;
        setSyncingPmis(false);
        setError(data.result?.error || "Không đồng bộ được PMIS 02-PĐ từ QLKT.");
        return;
      }
      const payload = data.result.payload as {
        operatingDate?: string;
        entries?: Array<{ cell: string; value: string }>;
      };
      if (payload.operatingDate !== request.operatingDate || !Array.isArray(payload.entries)) {
        pmisRequestRef.current = null;
        setSyncingPmis(false);
        setError("Dữ liệu QLKT trả về không đúng ngày hoặc cấu trúc không hợp lệ.");
        return;
      }
      const safeEntries = sanitizeCtktktPmisSyncEntries(payload.entries);
      const receivedCells = new Set(safeEntries.map(entry => entry.cell));
      const missingProduction = PMIS_PRODUCTION_CELLS.filter(cell => !receivedCells.has(cell));
      if (missingProduction.length) {
        pmisRequestRef.current = null;
        setSyncingPmis(false);
        setError(`QLKT chưa trả đủ sản lượng ${missingProduction.join(", ")}; hệ thống không lưu dữ liệu thiếu.`);
        return;
      }
      const updates: Record<string, string> = {};
      for (const entry of safeEntries) {
        updates[entry.cell] = entry.value;
      }
      setByDate(old => ({
        ...old,
        [request.operatingDate]: {
          ...(old[request.operatingDate] || {}),
          ...updates,
        },
      }));
      try {
        const res = await ctktktRequest("/api/ctktkt/ctktkt-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operatingDate: request.operatingDate,
            entries: safeEntries,
          }),
        });
        const resJson = (await res.json()) as { error?: string; saved?: number };
        if (!res.ok || resJson.error) {
          throw new Error(resJson.error || "Không lưu được dữ liệu đồng bộ.");
        }
        for (const entry of safeEntries) dirtyCellsRef.current.delete(entry.cell);
        setDirty(dirtyCellsRef.current.size > 0);
        setMessage(`Đã đồng bộ và lưu thành công ${safeEntries.length} chỉ tiêu PMIS Sản lượng & 02-PĐ (hàng Duyên Hải 1) từ QLKT cho ngày ${request.operatingDate.split("-").reverse().join("/")}!`);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã lấy dữ liệu nhưng không lưu được vào CSDL.");
      } finally {
        if (pmisRequestRef.current?.id === request.id) pmisRequestRef.current = null;
        setSyncingPmis(false);
      }
    };
    window.addEventListener("message", handleMessage);
    window.postMessage({ channel, sender: "ctktkt-web", type: "PING" }, window.location.origin);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (pmisRequestRef.current) {
        window.clearTimeout(pmisRequestRef.current.timer);
        pmisRequestRef.current = null;
      }
    };
  }, [ctktktRequest]);

  const period = date.slice(0, 7);

  useEffect(() => {
    const controller = new AbortController();
    const load=async(query:string)=>{
        const response=await ctktktRequest(`/api/ctktkt/ctktkt-report?${query}`,{cache:"no-store",signal:controller.signal});
        const body = (await response.json()) as {
          entries?: LoadedEntry[];
          linkedEntries?: LoadedEntry[];
          warnings?: LinkWarning[];
          operatingHoursMissingDates?: string[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Không tải được dữ liệu.");
        controller.signal.throwIfAborted();
        return body;
    };
    const group=(entries:LoadedEntry[]=[])=>{
      const result:Record<string,CtktktDayEntries>={};
      for(const entry of entries){result[entry.operatingDate]||={};result[entry.operatingDate][entry.cell]=entry.value;}
      return result;
    };
    async function run(){
      setLoading(true);setExtrasState("loading");setHoursMissingDates([]);
      try{
        // The editable day and previous readings are ready before monthly/annual totals.
        const day=await load(new URLSearchParams({period,date,scope:"daily-links"}).toString());
        setByDate(group(day.entries));setLinkedByDate(group(day.linkedEntries));setLinkWarnings(day.warnings||[]);
        setLoading(false);
        const previous=previousIsoDate(date);
        if(previous>`${period}-01`){
          const context=await load(new URLSearchParams({period,from:`${period}-01`,to:previous,scope:"daily-links"}).toString());
          // Do not replace today's inputs or yesterday's readings with a late response.
          const earlier=(entries:LoadedEntry[]=[])=>entries.filter(entry=>entry.operatingDate<previous);
          setByDate(old=>({...group(earlier(context.entries)),...old}));
          setLinkedByDate(old=>({...group(earlier(context.linkedEntries)),...old}));
        }
        const hours=await load(new URLSearchParams({period,date,scope:"operating-hours"}).toString());
        setLinkedByDate(old=>{
          const next={...old};
          for(const [day,values] of Object.entries(group(hours.linkedEntries)))next[day]={...next[day],...values};
          return next;
        });
        setHoursMissingDates(hours.operatingHoursMissingDates||[]);setExtrasState("ready");
      }catch(reason){
        if(!controller.signal.aborted){setExtrasState("error");setError(reason instanceof Error?reason.message:"Không tải được dữ liệu.");setLoading(false);}
      }
    }
    void run();
    return () => controller.abort();
  }, [period,date,reloadVersion, ctktktRequest]);

  const previousDate = previousIsoDate(date);
  const previous = useMemo(() => {
    const manual = byDate[previousDate];
    const linked = linkedByDate[previousDate];
    return manual || linked ? { ...(manual || {}), ...(linked || {}) } : undefined;
  }, [byDate, linkedByDate, previousDate]);

  const current = useMemo(() => {
    const manual = byDate[date] || {};
    const linked = linkedByDate[date] || {};
    const combined = { ...linked, ...manual };
    // Nếu manual trống nhưng linked có giá trị tái sinh hạt từ Báo cáo lượng nước thì tự động link
    if ((manual["Z72"] === undefined || manual["Z72"] === "") && linked["Z72"] !== undefined) {
      combined["Z72"] = linked["Z72"];
    }
    if ((manual["Z73"] === undefined || manual["Z73"] === "") && linked["Z73"] !== undefined) {
      combined["Z73"] = linked["Z73"];
    }
    // Các ô liên kết từ BCSX luôn lấy từ linked (bị khóa tự động từ BCSX)
    for (const cell of CTKTKT_BCSX_LINKED_CELLS) {
      if (linked[cell] !== undefined) combined[cell] = linked[cell];
    }
    // Công suất đặt DH1 là thông số cố định của nhà máy, dùng làm giá trị mặc định
    // bất kể file hoặc QLKT trả về giá trị nào cho ô C181.
    combined[CTKTKT_INSTALLED_CAPACITY_CELL] = CTKTKT_INSTALLED_CAPACITY_MW;
    return applyNh3StartLevelCarryover(combined, previous);
  }, [byDate, linkedByDate, date, previous]);

  const missingCtktkt = useMemo(() => {
    const optionalCells = new Set([
      "COAL_ADJ_NOTE_S1", "COAL_ADJ_NOTE_S2", "WATER_ADJ_NOTE_S1", "WATER_ADJ_NOTE_S2",
      "WATER_ADJ_S1", "WATER_ADJ_S2", "W28", "Y28", "AA28", "AG28", "AI28", "AK28",
    ]);
    const seen = new Set<string>();
    const cells = new Set<string>();
    for (const field of editableFields) {
      if (seen.has(field.cell) || optionalCells.has(field.cell)) continue;
      if (!shouldShowCtktktMissingField(field.cell, date, byDate)) continue;
      seen.add(field.cell);
      const group = getCtktktFieldGroup(field.cell);
      if (!group || group === "startup_shutdown" || !canEditCtktktField(user, field.cell)) continue;
      if (isMissingValue(current[field.cell])) cells.add(field.cell);
    }
    return cells;
  }, [current, user, byDate, date]);

  const isFirstDayOfMonth = date.endsWith("-01");
  const mergedByDate = useMemo(() => {
    const merged = new Map<string, CtktktDayEntries>();
    for (const day of new Set([...Object.keys(byDate), ...Object.keys(linkedByDate)])) {
      merged.set(day, { ...(linkedByDate[day] || {}), ...(byDate[day] || {}) });
    }
    merged.set(date, current);
    return merged;
  }, [byDate, linkedByDate, date, current]);
  const missingCtktktForExport = useMemo(() => {
    if (loading || error || date > defaultOperatingDate()) return [] as MissingDataItem[];
    const items: MissingDataItem[] = [];
    const seen = new Set<string>();
    for (const field of editableFields) {
      if (!missingCtktkt.has(field.cell) || seen.has(field.cell)) continue;
      seen.add(field.cell);
      const group = getCtktktFieldGroup(field.cell);
      if (!group) continue;
      const description = describeCtktktMissingField(field);
      if (!description) continue;
      items.push({
        key: `${date}|${field.cell}`,
        label: `${date.split("-").reverse().join("/")} · ${description}`,
        group: CTKTKT_GROUP_META[group]?.shortLabel || field.sectionLabel,
      });
    }
    return items;
  }, [date, missingCtktkt, loading, error]);
  const coalStock = useMemo(() => calculateCoalStock24h(mergedByDate, date), [mergedByDate, date]);
  const pmisCoalStock = useMemo(() => calculatePmisCoalStockOpening(mergedByDate, date), [mergedByDate, date]);
  // Giờ lũy kế cộng dồn từ QLKT kể từ 01/01/2026; chỉ tính các ngày QLKT chưa có tới ngày đang xem.
  const hoursMissingUpToDate = useMemo(() => hoursMissingDates.filter(day => day <= date), [hoursMissingDates, date]);

  const operationEventsValue = current[CTKTKT_OPERATION_EVENTS_CELL];
  const operationEvents = useMemo(
    () => parseCtktktOperationEvents(operationEventsValue),
    [operationEventsValue],
  );
  const selectedOperationEvent = operationEvents.find(event => event.unit === operationUnit && event.kind === operationKind) || null;
  const selectedOperationOil = selectedOperationEvent ? calculateCtktktOperationEventOil(selectedOperationEvent) : null;
  const canEditOperationEvents = canEditSelectedDate && canEditCtktktField(user, CTKTKT_OPERATION_EVENTS_CELL);

  const selectedWarnings = useMemo(
    () => linkWarnings.filter(item => item.operatingDate === date),
    [linkWarnings, date],
  );
  const hasPreviousManualData = Boolean(byDate[previousDate]);

  const beginCtktktOutput = (output: "excel" | "email") => {
    if(loading||extrasState!=="ready"){setError("Chờ tải đủ dữ liệu tồn kho và giờ lũy kế trước khi xuất báo cáo.");return;}
    if (missingCtktktForExport.length > 0) {
      setPendingReportOutput(output);
      setExportMissingItems(missingCtktktForExport);
      setExportMissingOpen(true);
      return;
    }
    if (output === "excel") void downloadReport(`/api/ctktkt/ctktkt-report/export?period=${encodeURIComponent(period)}`).catch(error=>setError(error instanceof Error?error.message:"Không tải được báo cáo."));
    else setShowEmailModal(true);
  };

  const continueCtktktOutput = () => {
    const output = pendingReportOutput;
    setExportMissingOpen(false);
    setPendingReportOutput(null);
    if (output === "excel") void downloadReport(`/api/ctktkt/ctktkt-report/export?period=${encodeURIComponent(period)}`).catch(error=>setError(error instanceof Error?error.message:"Không tải được báo cáo."));
    if (output === "email") setShowEmailModal(true);
  };

  const returnToCtktktMissingInput = (item = exportMissingItems[0]) => {
    const first = item;
    if (first && first.key.split("|")[0] !== date && (dirty || saving)) {
      setError("Hãy lưu số liệu ngày đang nhập trước khi chuyển sang ngày khác.");
      return;
    }
    setExportMissingOpen(false);
    setPendingReportOutput(null);
    if (!first) return;
    const [missingDate, cell] = first.key.split("|");
    setDate(missingDate);
    const group = getCtktktFieldGroup(cell);
    const tabByGroup: Partial<Record<CtktktFieldGroup, MainTab>> = {
      kpi_summary: "tkd_dcs", tkd_trend: "tkd_dcs",
      tpd_tcd_power: "unit_meters", lo_pho_oil: "unit_meters",
      may_nghien_coal_s1: "unit_meters", may_nghien_coal_s2: "unit_meters",
      steam_flow: "steam_nh3", nh3_tank: "steam_nh3", nh3_dcs: "steam_nh3",
      td21: "td21_coal_blend", coal_blend_pmis: "td21_coal_blend",
      startup_shutdown: "startup_shutdown", pmis_reports: "pmis_reports",
    };
    setActiveTab(group ? tabByGroup[group] || "all_fields" : "all_fields");
    setUnitView("both");
    if (group === "kpi_summary") setIsKpiCollapsed(false);
    setSearch("");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const focusCell = () => {
        const input = document.querySelector<HTMLInputElement>(`[data-cell="${cell}"]`);
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus({ preventScroll: true });
        return Boolean(input);
      };
      if (!focusCell()) {
        setActiveTab("all_fields");
        window.requestAnimationFrame(() => window.requestAnimationFrame(focusCell));
      }
    }));
  };

  // Tính toán chỉ tiêu tổng hợp toàn nhà máy
  const summary = useMemo(
    () => calculateCtktktSummary(current, previous),
    [current, previous],
  );
  const meterSummary = useMemo(
    () => calculateCtktktMeterSummary(current, previous),
    [current, previous],
  );
  const coalShiftDetails = useMemo(
    () => calculateCoalShiftDetails(current, previous),
    [current, previous],
  );

  // Tính toán tự động Cụm 2 TKĐ DCS
  const tkdCalc = useMemo(() => calculateTkdDcsSummary(current), [current]);

  // Tính dầu theo chênh lệch tăng công tơ F1 và F2; mốc đầu ngày lấy từ D-1.
  const oilS1 = useMemo(() => calculateOilDifferences(current, "s1", previous), [current, previous]);
  const oilS2 = useMemo(() => calculateOilDifferences(current, "s2", previous), [current, previous]);

  // Tính toán lưu lượng hơi S1 và S2
  const steamS1 = useMemo(() => calculateSteamDifferences(current, "s1"), [current]);
  const steamS2 = useMemo(() => calculateSteamDifferences(current, "s2"), [current]);
  const nh3 = useMemo(
    () => calculateNh3Summary(current, summary.plant.grossMwh, summary.plant.netMwh),
    [current, summary.plant.grossMwh, summary.plant.netMwh],
  );
  const nh3Dcs = useMemo(() => calculateNh3DcsSummary(current, previous), [current, previous]);

  const update = (cell: string, value: string) => {
    if (!canEditSelectedDate || !canEditCtktktField(user, cell)) return;
    setByDate(old => ({
      ...old,
      [date]: { ...(old[date] || {}), [cell]: value },
    }));
    dirtyCellsRef.current.add(cell);
    setDirty(true);
    setMessage("");
    setError("");
  };

  const saveOperationEvents = (events: CtktktOperationEvent[]) => {
    update(CTKTKT_OPERATION_EVENTS_CELL, JSON.stringify(events));
  };

  const addOperationEvent = () => {
    if (operationEvents.some(event => event.unit === operationUnit && event.kind === operationKind)) return;
    saveOperationEvents([...operationEvents, createCtktktOperationEvent(operationUnit, operationKind)]);
  };

  const deleteOperationEvent = (event: CtktktOperationEvent) => {
    saveOperationEvents(operationEvents.filter(item => ctktktOperationEventId(item.unit, item.kind) !== ctktktOperationEventId(event.unit, event.kind)));
  };

  const updateOperationPoint = (
    point: CtktktOperationPoint,
    patchValue: Partial<{ time: string; power: Record<string, string>; oilFeed: string; oilReturn: string }>,
  ) => {
    if (!selectedOperationEvent) return;
    const existing = selectedOperationEvent.points[point] || { time: "", power: {}, oilFeed: "", oilReturn: "" };
    const changed: CtktktOperationEvent = {
      ...selectedOperationEvent,
      points: { ...selectedOperationEvent.points, [point]: { ...existing, ...patchValue } },
    };
    saveOperationEvents(operationEvents.map(event =>
      event.unit === changed.unit && event.kind === changed.kind ? changed : event,
    ));
  };

  const save = async () => {
    if (!userCanEditAny) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const dirtyCells = [...dirtyCellsRef.current];
      const toSend = dirtyCells
        .filter(cell => canEditCtktktField(user, cell))
        .map(cell => ({ cell, value: current[cell] || "" }));
      if (!toSend.length) throw new Error("Không có ô dữ liệu nào vừa thay đổi để lưu.");

      const response = await ctktktRequest("/api/ctktkt/ctktkt-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatingDate: date,
          entries: toSend,
        }),
      });
      const body = (await response.json()) as { saved?: number; error?: string };
      if (!response.ok) throw new Error(body.error || "Không lưu được dữ liệu.");

      // Đọc lại ngay từ CSDL để không báo thành công giả. Lỗi từng gặp ở cụm
      // NH3 là giao diện vẫn giữ số vừa nhập nhưng tải lại trang thì mất.
      const verifyResponse = await ctktktRequest(`/api/ctktkt/ctktkt-report?period=${period}&date=${date}&scope=stored`, { cache: "no-store" });
      const verifyBody = (await verifyResponse.json()) as { entries?: LoadedEntry[]; error?: string };
      if (!verifyResponse.ok) throw new Error(verifyBody.error || "Đã gửi dữ liệu nhưng chưa kiểm tra lại được CSDL.");
      const persisted = Object.fromEntries(
        (verifyBody.entries || [])
          .filter(entry => entry.operatingDate === date)
          .map(entry => [entry.cell, entry.value]),
      );
      const mismatches = toSend.filter(entry =>
        normalizeCtktktInputValue(entry.cell, persisted[entry.cell] || "")
          !== normalizeCtktktInputValue(entry.cell, entry.value),
      );
      if (mismatches.length) {
        throw new Error(`CSDL chưa giữ đúng ${mismatches.length} ô (${mismatches.slice(0, 6).map(entry => entry.cell).join(", ")}). Chưa xác nhận lưu thành công.`);
      }
      setByDate(old => ({ ...old, [date]: persisted }));
      for (const entry of toSend) dirtyCellsRef.current.delete(entry.cell);
      setDirty(dirtyCellsRef.current.size > 0);
      setMessage(
        `Đã lưu thành công ${body.saved || 0} ô dữ liệu ngày ${date.split("-").reverse().join("/")}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được dữ liệu.");
    } finally {
      setSaving(false);
    }
  };

  const syncPmis02PdFromQlkt = () => {
    setError("");
    setMessage("");
    if (!canEditSelectedDate || !canEditCtktktGroup(user, "pmis_reports")) {
      setError("Tài khoản chưa được phân quyền cập nhật nhóm Báo cáo PMIS 02-PĐ.");
      return;
    }
    if (!extensionVersion) {
      window.postMessage({ channel: "ctktkt-qlkt-sync", sender: "ctktkt-web", type: "PING" }, window.location.origin);
      setError(`Chưa kết nối tiện ích QLKT. Hãy mở trang quản lý tiện ích, kiểm tra tiện ích đang bật rồi Ctrl+F5 trang web.`);
      return;
    }
    if (pmisRequestRef.current) window.clearTimeout(pmisRequestRef.current.timer);
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      if (pmisRequestRef.current?.id !== requestId) return;
      pmisRequestRef.current = null;
      setSyncingPmis(false);
      setError("QLKT phản hồi quá lâu. Chưa ghi dữ liệu; hãy kiểm tra phiên đăng nhập QLKT rồi thử lại.");
    }, 180000);
    pmisRequestRef.current = { id: requestId, timer, operatingDate: date };
    setSyncingPmis(true);
    setMessage("Đang mở và đọc màn hình Sản lượng và 02-PĐ (hàng Duyên Hải 1) từ QLKT…");
    window.postMessage({
      channel: "ctktkt-qlkt-sync",
      sender: "ctktkt-web",
      type: "SYNC_PMIS_02PD",
      requestId,
      operatingDate: date,
    }, window.location.origin);
  };

  // Điều hướng bằng bàn phím (Phím mũi tên ← ↑ → ↓, Enter, Tab) tương tự Excel
  const navigateCell = (
    currentInput: HTMLInputElement,
    direction: "up" | "down" | "left" | "right",
  ) => {
    const table = currentInput.closest("table");
    if (!table) return;

    const allRows = Array.from(table.querySelectorAll("tr"));
    const inputRows = allRows.filter(tr => tr.querySelector("input[data-cell]"));

    const currentTr = currentInput.closest("tr");
    if (!currentTr) return;
    const currentRowIdx = inputRows.indexOf(currentTr);
    if (currentRowIdx === -1) return;

    const editableInputs = (row: HTMLTableRowElement) => Array.from(
      row.querySelectorAll<HTMLInputElement>('input[data-cell][data-editable="true"]:not(:disabled)'),
    );
    const cellIndex = (input: HTMLInputElement) => input.closest<HTMLTableCellElement>("td,th")?.cellIndex ?? -1;
    const currentInputsInRow = editableInputs(currentTr);
    const currentInputIdx = currentInputsInRow.indexOf(currentInput);
    const currentCellIndex = cellIndex(currentInput);
    if (currentInputIdx === -1 || currentCellIndex === -1) return;

    let targetInput: HTMLInputElement | null = null;

    if (direction === "down") {
      for (let r = currentRowIdx + 1; r < inputRows.length; r++) {
        const rowInputs = editableInputs(inputRows[r]);
        const candidate = rowInputs.find(input => cellIndex(input) === currentCellIndex)
          || [...rowInputs].sort((a, b) => Math.abs(cellIndex(a) - currentCellIndex) - Math.abs(cellIndex(b) - currentCellIndex))[0];
        if (candidate) {
          targetInput = candidate;
          break;
        }
      }
    } else if (direction === "up") {
      for (let r = currentRowIdx - 1; r >= 0; r--) {
        const rowInputs = editableInputs(inputRows[r]);
        const candidate = rowInputs.find(input => cellIndex(input) === currentCellIndex)
          || [...rowInputs].sort((a, b) => Math.abs(cellIndex(a) - currentCellIndex) - Math.abs(cellIndex(b) - currentCellIndex))[0];
        if (candidate) {
          targetInput = candidate;
          break;
        }
      }
    } else if (direction === "right") {
      targetInput = currentInputsInRow[currentInputIdx + 1] || null;
      if (!targetInput) {
        for (let r = currentRowIdx + 1; r < inputRows.length; r++) {
          const rowInputs = editableInputs(inputRows[r]);
          const candidate = rowInputs[0];
          if (candidate) {
            targetInput = candidate;
            break;
          }
        }
      }
    } else if (direction === "left") {
      targetInput = currentInputsInRow[currentInputIdx - 1] || null;
      if (!targetInput) {
        for (let r = currentRowIdx - 1; r >= 0; r--) {
          const candidates = editableInputs(inputRows[r]);
          if (candidates.length > 0) {
            targetInput = candidates[candidates.length - 1];
            break;
          }
        }
      }
    }

    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      navigateCell(input, "down");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      navigateCell(input, "up");
    } else if (e.key === "Enter") {
      e.preventDefault();
      navigateCell(input, e.shiftKey ? "up" : "down");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateCell(input, "right");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateCell(input, "left");
    } else if (e.key === "Tab") {
      e.preventDefault();
      navigateCell(input, e.shiftKey ? "left" : "right");
    }
  };

  // Dán dữ liệu nhiều ô cùng lúc từ Excel / Google Sheets (ngăn cách bằng Tab và Xuống dòng)
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startCell: string,
  ) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    // Chỉ can thiệp nếu clipboard chứa tab hoặc xuống dòng (dữ liệu nhiều ô)
    if (!text.includes("\t") && !text.includes("\n") && !text.includes("\r")) {
      return;
    }

    e.preventDefault();

    const rows = parseSpreadsheetClipboard(text);
    if (rows.length === 0) return;

    const currentInput = e.currentTarget;
    const table = currentInput.closest("table");
    if (!table) {
      const firstVal = rows[0]?.[0];
      if (firstVal !== undefined) update(startCell, firstVal);
      return;
    }

    const allRows = Array.from(table.querySelectorAll("tr"));
    const inputRows = allRows.filter(tr => tr.querySelector("input[data-cell]"));

    const currentTr = currentInput.closest("tr");
    if (!currentTr) return;
    const startRowIdx = inputRows.indexOf(currentTr);
    if (startRowIdx === -1) return;

    const currentInputsInRow = Array.from(currentTr.querySelectorAll<HTMLInputElement>("input[data-cell]"));
    const currentEditableInputs = currentInputsInRow.filter(input => input.dataset.editable === "true" && !input.disabled);
    const startEditableIdx = currentEditableInputs.indexOf(currentInput);
    if (startEditableIdx === -1) return;
    const startVisualCol = currentInput.closest<HTMLTableCellElement>("td,th")?.cellIndex ?? -1;
    const widestClipboardRow = Math.max(...rows.map(row => row.length));
    const compactCapacity = currentEditableInputs.length - startEditableIdx;
    const useVisualColumns = startVisualCol >= 0 && widestClipboardRow > compactCapacity;

    const updates: Record<string, string> = {};
    let count = 0;

    for (let r = 0; r < rows.length; r++) {
      const targetRowIdx = startRowIdx + r;
      if (targetRowIdx >= inputRows.length) break;

      const targetTr = inputRows[targetRowIdx];
      const targetInputs = Array.from(
        targetTr.querySelectorAll<HTMLInputElement>("input[data-cell]"),
      );
      const targetEditableInputs = targetInputs.filter(input => input.dataset.editable === "true" && !input.disabled);

      const rowValues = rows[r];
      for (let c = 0; c < rowValues.length; c++) {
        const targetInput = useVisualColumns
          ? targetInputs.find(input => input.closest<HTMLTableCellElement>("td,th")?.cellIndex === startVisualCol + c)
          : targetEditableInputs[startEditableIdx + c];
        if (!targetInput) continue;
        const cellName = targetInput.getAttribute("data-cell");
        const isEditable = targetInput.getAttribute("data-editable") === "true";

        if (cellName && isEditable && !targetInput.disabled) {
          updates[cellName] = rowValues[c];
          count++;
        }
      }
    }

    if (count > 0) {
      setByDate(old => ({
        ...old,
        [date]: { ...(old[date] || {}), ...updates },
      }));
      for (const cell of Object.keys(updates)) dirtyCellsRef.current.add(cell);
      setDirty(true);
      setMessage(`Đã dán thành công ${count} ô từ bảng tính vào ngày ${date.split("-").reverse().join("/")}.`);
      setError("");
    }
  };

  // Helper render ô nhập liệu có kiểm tra quyền và giao diện rõ ràng
  const renderCellInput = (
    cell: string,
    options?: {
      placeholder?: string;
      className?: string;
      isNumber?: boolean;
      group?: CtktktFieldGroup;
      compact?: boolean;
      maxLength?: number;
      readOnlyValue?: string;
    },
  ) => {
    const isWaterLinked = CTKTKT_WATER_LINKED_CELLS.has(cell);
    const isQlktProduction = QLKT_PRODUCTION_CELLS.has(cell);
    const isFixed = cell === CTKTKT_INSTALLED_CAPACITY_CELL;
    const isNh3Carryover = NH3_START_LEVEL_CELLS.has(cell);
    const isNh3OpeningStock = cell === NH3_OPENING_STOCK_CELL;
    const isNh3StartMeter = NH3_DCS_START_METER_CELLS.has(cell);
    const isLinked = CTKTKT_BCSX_LINKED_CELLS.has(cell) || isWaterLinked || isQlktProduction || isFixed || isNh3Carryover || isNh3StartMeter || isNh3OpeningStock;
    const isComputed = options?.readOnlyValue !== undefined;
    const isManual = !isLinked && !isComputed;
    const canEditThis = isManual && canEditSelectedDate && canEditCtktktField(user, cell);
    const value = isComputed ? options.readOnlyValue ?? "" : current[cell] || "";
    const isMissingEditableValue = canEditThis && missingCtktkt.has(cell) && isMissingValue(value);

    const groupMeta = options?.group ? CTKTKT_GROUP_META[options.group] : null;
    const tooltip = isComputed
      ? `${cell}: Tự tính, không nhập tay`
      : isLinked
      ? isNh3OpeningStock
        ? `${cell}: Tồn kho NH3 00h tự lấy từ tồn kho 24h ngày D-1; thiếu dữ liệu ngày D-1 thì để trống`
        : isFixed
        ? `${cell}: Công suất đặt cố định của NMNĐ Duyên Hải 1 (${CTKTKT_INSTALLED_CAPACITY_MW} MW)`
        : isNh3StartMeter
          ? `${cell}: Công tơ NH3 00h tự lấy từ mốc 24h ngày D-1`
          : isNh3Carryover
            ? `${cell}: Mức bồn NH3 tự lấy từ mốc 24h ngày D-1`
          : `${cell}: Liên kết tự động từ ${isQlktProduction ? "QLKT · Sản lượng" : isWaterLinked ? "Theo dõi lượng nước" : cell === COAL_STOCK_24H_START_CELL ? "BCSX mục 2" : "BCSX mục 1"}`
      : canEditThis
        ? `${cell}: Bạn có quyền nhập liệu (Phím mũi tên để chuyển ô, Ctrl+V để dán nhiều ô)`
        : `${cell}: Khóa (Chỉ ${groupMeta?.responsible || "cương vị được phân công"} nhập)`;

    return (
      <div className="relative flex items-center justify-center">
        <input
          style={{ textAlign: "center", fontSize: isManual ? 14 : 12, fontWeight: isManual ? 700 : 400, borderColor: isMissingEditableValue ? "#dc2626" : isManual ? "#173b64" : undefined }}
          data-cell={cell}
          data-editable={canEditThis ? "true" : "false"}
          disabled={!canEditThis || loading || saving}
          aria-invalid={isMissingEditableValue || undefined}
          inputMode={options?.isNumber === false ? "text" : "decimal"}
          maxLength={options?.maxLength}
          value={value}
          onChange={e => update(cell, e.target.value)}
          onFocus={e => e.currentTarget.select()}
          onKeyDown={handleCellKeyDown}
          onPaste={e => handleCellPaste(e, cell)}
          placeholder={options?.placeholder || "—"}
          title={tooltip}
          className={`h-7 w-full rounded border px-1.5 text-center font-mono text-xs font-bold tabular-nums outline-none transition-all ${
            isMissingEditableValue
              ? "animate-pulse border-red-600 bg-red-50 text-red-950 ring-1 ring-red-400 motion-reduce:animate-none"
              : isLinked
              ? "border-blue-200 bg-blue-50/80 text-blue-900 cursor-not-allowed"
              : canEditThis
                ? "border-slate-300 bg-white text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs hover:border-indigo-400"
                : "border-slate-200 bg-slate-100/90 text-slate-500 cursor-not-allowed"
          } ${options?.className || ""}`}
        />
        {!canEditThis && !isLinked && (
          <Lock
            className="pointer-events-none absolute right-1.5 top-2 size-3 text-slate-400"
            aria-hidden="true"
          />
        )}
      </div>
    );
  };

  // Danh tính và thông báo cương vị người dùng
  const userRoleDescription = useMemo(() => {
    if (!user) return "Chưa đăng nhập (Chỉ xem)";
    const isLeader = isAdminUser(user) || user.permissions.includes("edit_ctktkt");

    if (isLeader) {
      return "Toàn quyền quản lý, nhập liệu và phê duyệt số liệu";
    }

    if (editableGroups.length === 0) {
      if (user.permissions.includes("ctktkt_other_fields")) return "Quyền nhập: Các ô bổ sung ngoài nhóm";
      return "Chế độ chỉ xem (Không có quyền nhập cho cương vị này)";
    }

    return `Quyền nhập: ${editableGroups.map(g => CTKTKT_GROUP_META[g]?.shortLabel).join(", ")}`;
  }, [user, editableGroups]);

  return (
    <section className="module-report ktkt-workspace mx-auto grid w-full min-w-0 max-w-full gap-3">
      {extrasState!=="ready"&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
        <span>{loading?"Đang tải số liệu ngày…":extrasState==="loading"?"Số liệu ngày đã sẵn sàng. Đang tải tiếp tồn kho và giờ lũy kế…":"Chưa tải đủ số liệu tổng hợp. Hãy lưu ô đang nhập rồi tải lại trước khi xuất báo cáo."}</span>
        {extrasState==="error"&&<button type="button" disabled={dirty||saving||syncingPmis} onClick={()=>{setError("");setReloadVersion(v=>v+1);}} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Tải lại dữ liệu</button>}
      </div>}
      <ExportMissingDialog
        open={exportMissingOpen}
        items={exportMissingItems}
        title={`Báo cáo Chỉ tiêu KTKT ngày ${date.split("-").reverse().join("/")}`}
        onClose={() => { setExportMissingOpen(false); setPendingReportOutput(null); }}
        onItemClick={returnToCtktktMissingInput}
        onFillMissing={returnToCtktktMissingInput}
        onExportAnyway={continueCtktktOutput}
      />
      {/* 1. THANH TIÊU ĐỀ, CHỌN NGÀY VÀ ĐIỀU HÀNH */}
      <div className="module-hero module-toolbar-card rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="module-heading-copy">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-indigo-800 uppercase">
                Báo cáo gốc · Tự tính theo công thức
              </span>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs font-semibold text-slate-500">
                PXVH1 · Phân quyền theo Cương vị
              </span>
            </div>
            <h1 className="mt-1 text-xl font-black text-[#173b64]">
              Chỉ tiêu kinh tế kỹ thuật NMNĐ Duyên Hải 1
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <span>Ngày báo cáo:</span>
              <DateField
                value={date}
                max={vietnamDateIso()}
                disabled={saving || syncingPmis}
                onChange={value => {
                  if (value === date) return;
                  if (dirtyCellsRef.current.size > 0 || saving) {
                    setError("Hãy lưu số liệu ngày đang nhập trước khi chuyển sang ngày khác.");
                    return;
                  }
                  setLoading(true);
                  setDate(value);
                  dirtyCellsRef.current.clear();
                  setDirty(false);
                  setMessage("");
                  setError("");
                }}
                className="w-36"
              />
            </label>

            <button
              type="button"
              onClick={save}
              disabled={!userCanEditAny || saving || loading || !dirty}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-[#4057b5] px-4 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#334694] disabled:opacity-45"
            >
              <Save className="size-3.5" />
              {saving ? "Đang lưu…" : "Lưu số liệu"}
            </button>

            <button
              type="button"
              onClick={() => beginCtktktOutput("excel")}
              disabled={loading||extrasState!=="ready"}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-800"
            >
              <Download className="size-3.5" />
              Xuất Excel tháng
            </button>

            <button
              type="button"
              onClick={() => beginCtktktOutput("email")}
              disabled={loading||extrasState!=="ready"}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95"
              title="Mở mẫu báo cáo gửi mail hàng ngày font Times New Roman theo file chỉ tiêu"
            >
              <Mail className="size-3.5" />
              Báo cáo gửi mail
            </button>
          </div>
        </div>

        {/* Banner thông tin cương vị & phân quyền */}
        <div className="ktkt-role-banner mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-[#f5f8ff] px-3.5 py-2 text-xs text-[#1e3a8a]">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="size-4 text-indigo-700 shrink-0" />
            <span className="font-bold text-slate-800">
              {user?.displayName || "Khách"}
            </span>
            {user?.position && (
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-bold text-indigo-800">
                {user.position}
              </span>
            )}
            <span className="text-slate-400">·</span>
            <span className="font-medium text-slate-600">{userRoleDescription}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-blue-500"></span>
              Ô xanh: Lấy từ BCSX
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-indigo-600"></span>
              Ô trắng: Nhập tay
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-slate-300"></span>
              Ô xám/khóa: Tự tính / Cương vị khác
            </span>
            <span className="flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-800">
              ⌨️ Phím mũi tên (← ↑ → ↓) / Enter để chuyển ô · Dán Ctrl+V nhiều ô từ Excel
            </span>
          </div>
        </div>

        {!canEditSelectedDate && !loading && (
          <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {date === vietnamDateIso()
              ? "Ngày D đang khóa nhập. Chỉ nhập số liệu từ ngày D-1 trở về trước."
              : "Ngày trước D-1 chỉ tài khoản quản trị được chỉnh sửa; tài khoản hiện tại chỉ xem."}
          </p>
        )}

        {!hasPreviousManualData && !loading && (
          <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            Chưa có chỉ số ngày trước ({previousDate}), các giá trị chênh lệch công tơ tạm
            hiển thị “—”. Hãy nhập ngày trước trước khi chốt báo cáo.
          </p>
        )}
        {selectedWarnings.map(item => (
          <p
            key={`${item.cell}-${item.message}`}
            role="alert"
            className="mt-2 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
          >
            {item.message}
          </p>
        ))}
        {error && (
          <p
            role="alert"
            className="mt-2 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900"
          >
            {message}
          </p>
        )}
      </div>

      <ReportCorrections key={date} date={date} getStaged={()=>[...dirtyCellsRef.current].filter(cell=>canEditCtktktField(user,cell)).map(cell=>({cell,value:current[cell]||""}))} onUpdated={()=>setReloadVersion(v=>v+1)}/>

      <button type="button" className="my-2 min-h-10 rounded-lg border border-blue-300 px-4 text-sm font-semibold text-blue-800" onClick={() => { const target = document.getElementById('ktkt-correction-requests'); if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({behavior:'smooth',block:'start'}); } }}>Đề xuất chỉnh sửa / Xem yêu cầu duyệt</button>
      {/* 2. BẢNG KẾT QUẢ TÍNH TỰ ĐỘNG KPI & Ô NHẬP TAY CỤM 1 (I35, I36, W87) */}
      <div className="ktkt-kpi-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="module-section-heading flex flex-wrap items-center justify-between gap-2 border-b bg-[#f8faff] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black text-[#173b64] uppercase tracking-wider">
              Cụm 1 · Thống kê chỉ tiêu KTKT NMNĐ Duyên Hải 1
            </h2>
            <span className="text-[11px] text-slate-500">
              (PMIS là số liệu chính · Công tơ chỉ đối chiếu · Nhập I35, I36, W87)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEmailModal(true)}
              className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
              title="Mở mẫu báo cáo gửi mail hàng ngày font Times New Roman theo file chỉ tiêu"
            >
              <Mail className="size-3" />
              Mẫu gửi mail
            </button>
            <button
              type="button"
              onClick={() => setIsKpiCollapsed(prev => !prev)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200/60"
            >
            {isKpiCollapsed ? (
              <>
                <span>Mở rộng KPI</span>
                <ChevronDown className="size-3.5" />
              </>
            ) : (
              <>
                <span>Thu gọn KPI</span>
                <ChevronUp className="size-3.5" />
              </>
            )}
            </button>
          </div>
        </div>

        {!isKpiCollapsed ? (
          <div>
            <div className="module-table-scroll ktkt-kpi-scroll">
              <table className="report-data-table w-full text-xs">
                <colgroup><col style={{width:"22%"}}/><col span={4} style={{width:"14%"}}/><col span={2} style={{width:"8.5%"}}/><col style={{width:"5%"}}/></colgroup>
                <thead>
                  <tr className="border-b bg-[#e9f2fa] text-[#173b64]">
                    <th rowSpan={2} className="p-2 text-left font-bold">Chỉ tiêu KTKT</th>
                    <th colSpan={2} className="p-2 text-center font-bold">Tổ máy S1</th>
                    <th colSpan={2} className="p-2 text-center font-bold">Tổ máy S2</th>
                    <th colSpan={2} className="p-2 text-center font-bold">Toàn Nhà máy</th>
                    <th rowSpan={2} className="p-2 text-center font-bold">Đơn vị</th>
                  </tr>
                  <tr className="border-b bg-[#f4f8fc] text-[10px] font-bold text-slate-600">
                    <th className="p-1.5 text-center">PMIS/QLKT</th>
                    <th className="p-1.5 text-center">Công tơ/Excel</th>
                    <th className="p-1.5 text-center">PMIS/QLKT</th>
                    <th className="p-1.5 text-center">Công tơ/Excel</th>
                    <th className="p-1.5 text-center">PMIS/QLKT</th>
                    <th className="p-1.5 text-center">Công tơ/Excel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metricRows.map(row => (
                    <tr key={row.key} className="hover:bg-slate-50/70">
                      <td className="p-2 font-medium text-slate-800">{row.label}</td>
                      <td className="bg-cyan-50/30 p-2 text-center font-mono tabular-nums text-[#173b64] text-sm font-semibold">
                        {(ctktktMetricDisplay(summary.s1, row.key) ?? format(summary.s1[row.key]))}
                      </td>
                      <td className="bg-amber-50/40 p-2 text-center font-mono tabular-nums text-amber-900 text-sm font-semibold">
                        {meterComparisonKeys.has(row.key) ? (ctktktMetricDisplay(meterSummary.s1, row.key) ?? format(meterSummary.s1[row.key])) : "—"}
                      </td>
                      <td className="bg-cyan-50/30 p-2 text-center font-mono tabular-nums text-[#173b64] text-sm font-semibold">
                        {(ctktktMetricDisplay(summary.s2, row.key) ?? format(summary.s2[row.key]))}
                      </td>
                      <td className="bg-amber-50/40 p-2 text-center font-mono tabular-nums text-amber-900 text-sm font-semibold">
                        {meterComparisonKeys.has(row.key) ? (ctktktMetricDisplay(meterSummary.s2, row.key) ?? format(meterSummary.s2[row.key])) : "—"}
                      </td>
                      <td className="bg-blue-50/40 p-2 text-center font-mono tabular-nums text-indigo-900 text-sm font-semibold">
                        {(ctktktMetricDisplay(summary.plant, row.key) ?? format(summary.plant[row.key]))}
                      </td>
                      <td className="bg-amber-50/40 p-2 text-center font-mono tabular-nums text-amber-900 text-sm font-semibold">
                        {meterComparisonKeys.has(row.key) ? (ctktktMetricDisplay(meterSummary.plant, row.key) ?? format(meterSummary.plant[row.key])) : "—"}
                      </td>
                      <td className="p-2 text-center font-medium text-slate-500 text-xs">{row.unit}</td>
                    </tr>
                  ))}
                  {/* Các ô nhập tay của Cụm 1 */}
                  <tr className="bg-amber-50/30 border-t-2 border-amber-200">
                    <td className="p-2 font-bold text-amber-950">
                      Suất hao bi nghiền than S1 / S2 (Ô E39, H39)
                    </td>
                    <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                      Để trống = mặc định 150 g/tấn than
                    </td>
                    <td colSpan={2} className="p-1.5 text-center w-36 text-xs">
                      <div className="grid grid-cols-2 gap-1">
                        {renderCellInput("E39", { placeholder: "150", group: "kpi_summary" })}
                        {renderCellInput("H39", { placeholder: "150", group: "kpi_summary" })}
                      </div>
                    </td>
                    <td className="p-2 text-center text-slate-600 font-normal text-xs">g/tấn than</td>
                  </tr>
                  <tr className="bg-amber-50/30">
                    <td className="p-2 font-bold text-amber-950">
                      Lượng dầu nhập (Ô I35)
                    </td>
                    <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                      Dầu nhập kho trong ngày · Cộng vào dầu tồn kho (J37)
                    </td>
                    <td colSpan={2} className="p-1.5 text-center w-36 text-xs">
                      {renderCellInput("I35", {
                        placeholder: "0",
                        group: "kpi_summary",
                      })}
                    </td>
                    <td className="p-2 text-center text-slate-600 font-normal text-xs">tấn</td>
                  </tr>
                  <tr className="bg-amber-50/30">
                    <td className="p-2 font-bold text-amber-950">
                      Than nhập 24h (Ô I36)
                    </td>
                    <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                      Dùng tính than tồn kho 24h cho Nhập liệu BCSX
                    </td>
                    <td colSpan={2} className="p-1.5 text-center w-36 text-xs">
                      {renderCellInput("I36", {
                        placeholder: "0",
                        group: "kpi_summary",
                      })}
                    </td>
                    <td className="p-2 text-center text-slate-600 font-normal text-xs">tấn</td>
                  </tr>
                  <tr className="bg-amber-50/30">
                    <td className="p-2 font-bold text-amber-950">
                      Than tồn kho 24h
                    </td>
                    <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                      Tự động liên kết từ ô “Than tồn kho 24h (tấn, toàn nhà máy)” đã nhập tay tại Nhập liệu BCSX
                    </td>
                    <td colSpan={2} className="p-1.5 text-center w-36 text-xs">
                      {renderCellInput(COAL_STOCK_24H_START_CELL, {
                        placeholder: "Chưa nhập tại BCSX",
                        group: "kpi_summary",
                      })}
                    </td>
                    <td className="p-2 text-center text-slate-600 font-normal text-xs">tấn</td>
                  </tr>
                  <tr className="bg-amber-50/30">
                    <td className="p-2 font-bold text-amber-950">
                      Than tồn kho ngày D-1 theo PMIS (Ô W86)
                    </td>
                    <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                      {isFirstDayOfMonth
                        ? "Nhập một lần tại ngày 01 · Các ngày sau = W89 ngày D-1 (W86 + W87 − W88)"
                        : pmisCoalStock.missing
                          ? pmisCoalStock.missing
                          : "Tự tính = W89 ngày D-1 (W86 + W87 − than tiêu thụ quy ẩm W88)"}
                    </td>
                    <td colSpan={2} className="p-1.5 text-center w-36 text-xs">
                      {renderCellInput("W86", {
                        placeholder: isFirstDayOfMonth ? "Nhập ngày 01" : "—",
                        group: "kpi_summary",
                        readOnlyValue: isFirstDayOfMonth ? undefined : pmisCoalStock.stock === null ? "" : format(pmisCoalStock.stock),
                      })}
                    </td>
                    <td className="p-2 text-center text-slate-600 font-normal text-xs">tấn</td>
                  </tr>
                  {([["S1", "68"], ["S2", "69"]] as const).map(([unitLabel, row]) => (
                    <tr key={row} className="bg-amber-50/30">
                      <td className="p-2 font-bold text-amber-950">
                        Thời gian lũy kế {unitLabel} (Ô W{row}:Z{row})
                      </td>
                      <td colSpan={6} className="p-1.5">
                        <div className="grid grid-cols-4 gap-1.5">
                          {(["W", "X", "Y", "Z"] as const).map((column, index) => (
                            <label key={column} className="flex flex-col text-[10px] font-semibold text-slate-500">
                              {["Giờ vận hành", "Giờ sửa chữa", "Giờ sự cố", "Dự phòng"][index]}
                              {renderCellInput(`${column}${row}`, {
                                group: "kpi_summary",
                                readOnlyValue: current[`${column}${row}`] ? format(Number(current[`${column}${row}`])) : "",
                              })}
                            </label>
                          ))}
                        </div>
                        <div className="mt-1 text-[10px] italic text-slate-500">Tự cộng dồn từ QLKT kể từ 01/01/2026: giờ phát {unitLabel === "S1" ? "F" : "L"}; sự cố CT, sửa chữa CU, dự phòng CS gán cho tổ máy không chạy đủ 24 giờ.</div>
                        {hoursMissingUpToDate.length > 0 && (
                          <div className="mt-1 text-[10px] font-semibold text-amber-700">
                            Còn {hoursMissingUpToDate.length} ngày chưa có giờ phát QLKT (từ {hoursMissingUpToDate[0].split("-").reverse().join("/")}); lũy kế đang thiếu các ngày này. Đồng bộ QLKT theo khoảng ngày tại trang Dữ liệu các tháng.
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center text-slate-600 font-normal text-xs">giờ</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50/30">
                    <td className="p-2 font-bold text-amber-950">
                      Than nhập 06h (Ô W87)
                    </td>
                    <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                      Nhập sau 06h theo QLKT trang Nhiên liệu · Tồn kho ngày D (W89 = W86 + W87 − W88) và là W86 của ngày D+1
                    </td>
                    <td colSpan={2} className="p-1.5 text-center w-36 text-xs">
                      {renderCellInput("W87", {
                        placeholder: "Nhập sau 06h",
                        group: "kpi_summary",
                      })}
                    </td>
                    <td className="p-2 text-center text-slate-600 font-normal text-xs">tấn</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 bg-slate-50 px-4 py-2 text-xs">
            <span>
              Điện đầu cực: <b>S1 {format(summary.s1.grossMwh)}</b> /{" "}
              <b>S2 {format(summary.s2.grossMwh)} MWh</b>
            </span>
            <span>
              Than quy ẩm: <b>{format(summary.plant.adjustedCoalTonnes)} tấn</b>
            </span>
            <span>
              Suất hao than: <b>{format(summary.plant.netCoalRate)} g/kWh</b>
            </span>
            <span>
              Suất hao nhiệt: <b>{format(summary.plant.netHeatRate)} kJ/kWh</b>
            </span>
          </div>
        )}
      </div>

      {/* 3. TABS ĐIỀU HƯỚNG CÁC CỤM VẬN HÀNH (THIẾT KẾ RÕ RÀNG THEO CƯƠNG VỊ) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="ktkt-option-tabs grid grid-cols-1 gap-1.5 border-b bg-[#fbf7f2] p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-7">
          <button
            type="button"
            aria-pressed={activeTab === "tkd_dcs"}
            onClick={() => setActiveTab("tkd_dcs")}
            className={reportTabClass(activeTab === "tkd_dcs")}
          >
            <Zap className="size-4 shrink-0" />
            <span>DCS P/Q/U và lượng nước 24h</span>
          </button>

          <button
            type="button"
            aria-pressed={activeTab === "unit_meters"}
            onClick={() => setActiveTab("unit_meters")}
            className={reportTabClass(activeTab === "unit_meters")}
          >
            <Power className="size-4 shrink-0" />
            <span>Công tơ điện/than/dầu</span>
          </button>

          <button
            type="button"
            aria-pressed={activeTab === "steam_nh3"}
            onClick={() => setActiveTab("steam_nh3")}
            className={reportTabClass(activeTab === "steam_nh3")}
          >
            <Droplets className="size-4 shrink-0" />
            <span>Tiêu hao hơi và NH3</span>
          </button>

          <button
            type="button"
            aria-pressed={activeTab === "td21_coal_blend"}
            onClick={() => setActiveTab("td21_coal_blend")}
            className={reportTabClass(activeTab === "td21_coal_blend")}
          >
            <Boxes className="size-4 shrink-0" />
            <span>TD21 và tính toán than</span>
          </button>

          <button
            type="button"
            aria-pressed={activeTab === "startup_shutdown"}
            onClick={() => setActiveTab("startup_shutdown")}
            className={reportTabClass(activeTab === "startup_shutdown")}
          >
            <Flame className="size-4 shrink-0" />
            <span>Khởi động/ngừng tổ máy</span>
          </button>

          <button
            type="button"
            aria-pressed={activeTab === "pmis_reports"}
            onClick={() => setActiveTab("pmis_reports")}
            className={reportTabClass(activeTab === "pmis_reports")}
          >
            <FileText className="size-4 shrink-0" />
            <span>Báo cáo từ PMIS</span>
          </button>

          <div className="min-w-0">
            <button
              type="button"
              aria-pressed={activeTab === "all_fields"}
            onClick={() => setActiveTab("all_fields")}
              className={`${reportTabClass(activeTab === "all_fields")} w-full`}
            >
              <Search className="size-4 shrink-0" />
              <span>Tra cứu ô ({editableFields.length})</span>
            </button>
          </div>
        </div>

        {/* NỘI DUNG TỪNG CỤM */}
        <div className="p-3">
          {/* ========================================================================= */}
          {activeTab === "tkd_dcs" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div>
                  <h3 className="text-sm font-black text-[#173b64]">
                    Cụm 2: Bảng TKĐ trend DCS nhập (6 mốc giờ: 06h, 10h, 14h, 18h, 22h, 24h)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Trưởng kíp điện nhập 6 hàng: P TD 911, P TD 912, P TD 921, P TD 922, P TD 21,
                    Q TD 21. Các hàng công suất tổ máy lấy tự động từ BCSX mục 1. Các hàng tổng
                    tự động tính.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                    BCSX: Tự điền
                  </span>
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                    TKĐ: Nhập tay
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="report-data-table w-full text-xs">
                  <thead>
                    <tr className="border-b bg-[#e9f2fa] text-[#173b64]">
                      <th className="p-2 text-left font-bold w-48">Thông số / Đại lượng</th>
                      <th className="p-2 text-center font-bold w-16">Đơn vị</th>
                      {TKD_HOURS.map(h => (
                        <th key={h.col} className="p-2 text-center font-bold">
                          {h.label}
                        </th>
                      ))}
                      <th className="p-2 text-center font-bold w-24">Cương vị nhập</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {/* Hàng 1: P S1 (MW) */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">P S1 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}3`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>

                    {/* Hàng 2: Q S1 (MVAr) */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">Q S1 (MVAr)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MVAr</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}4`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>

                    {/* Hàng 3: P S2 (MW) */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">P S2 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}5`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>

                    {/* Hàng 4: Q S2 (MVAr) */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">Q S2 (MVAr)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MVAr</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}6`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>

                    {/* Hàng 5: P MBT T1 (MW) */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">P MBT T1 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}7`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>

                    {/* Hàng 6: P MBT T2 (MW) */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">P MBT T2 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}8`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>

                    {/* Hàng 7: P TD 911 (MW) — TRƯỞNG KÍP ĐIỆN NHẬP */}
                    <tr className="bg-amber-50/40">
                      <td className="p-2 font-bold text-amber-950 font-sans">P TD 911 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}9`, {
                            group: "tkd_trend",
                            isNumber: true,
                          })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] font-normal text-amber-900 font-sans text-xs">
                        Trưởng kíp điện
                      </td>
                    </tr>

                    {/* Hàng 8: P TD 912 (MW) — TRƯỞNG KÍP ĐIỆN NHẬP */}
                    <tr className="bg-amber-50/40">
                      <td className="p-2 font-bold text-amber-950 font-sans">P TD 912 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}10`, {
                            group: "tkd_trend",
                            isNumber: true,
                          })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] font-normal text-amber-900 font-sans text-xs">
                        Trưởng kíp điện
                      </td>
                    </tr>

                    {/* Hàng 9: P Σ TD S1 (MW) — TỰ ĐỘNG TÍNH */}
                    <tr className="bg-slate-100/70 font-bold">
                      <td className="p-2 text-slate-900 font-sans">P Σ TD S1 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-2 text-center text-indigo-900 tabular-nums text-xs">
                          {format(tkdCalc[h.col]?.pSumTdS1)}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-slate-500 font-sans text-xs">
                        Tự động (911+912)
                      </td>
                    </tr>

                    {/* Hàng 10: P TD 921 (MW) — TRƯỞNG KÍP ĐIỆN NHẬP */}
                    <tr className="bg-amber-50/40">
                      <td className="p-2 font-bold text-amber-950 font-sans">P TD 921 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}12`, {
                            group: "tkd_trend",
                            isNumber: true,
                          })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] font-normal text-amber-900 font-sans text-xs">
                        Trưởng kíp điện
                      </td>
                    </tr>

                    {/* Hàng 11: P TD 922 (MW) — TRƯỞNG KÍP ĐIỆN NHẬP */}
                    <tr className="bg-amber-50/40">
                      <td className="p-2 font-bold text-amber-950 font-sans">P TD 922 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}13`, {
                            group: "tkd_trend",
                            isNumber: true,
                          })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] font-normal text-amber-900 font-sans text-xs">
                        Trưởng kíp điện
                      </td>
                    </tr>

                    {/* Hàng 12: P Σ TD S2 (MW) — TỰ ĐỘNG TÍNH */}
                    <tr className="bg-slate-100/70 font-bold">
                      <td className="p-2 text-slate-900 font-sans">P Σ TD S2 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-2 text-center text-indigo-900 tabular-nums text-xs">
                          {format(tkdCalc[h.col]?.pSumTdS2)}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-slate-500 font-sans text-xs">
                        Tự động (921+922)
                      </td>
                    </tr>

                    {/* Hàng 13: P TD 21 (MW) — TRƯỞNG KÍP ĐIỆN NHẬP */}
                    <tr className="bg-amber-50/40">
                      <td className="p-2 font-bold text-amber-950 font-sans">P TD 21 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}15`, {
                            group: "tkd_trend",
                            isNumber: true,
                          })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] font-normal text-amber-900 font-sans text-xs">
                        Trưởng kíp điện
                      </td>
                    </tr>

                    {/* Hàng 14: Q TD 21 (MVAr) — TRƯỞNG KÍP ĐIỆN NHẬP */}
                    <tr className="bg-amber-50/40">
                      <td className="p-2 font-bold text-amber-950 font-sans">Q TD 21( MVAr)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MVAr</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}16`, {
                            group: "tkd_trend",
                            isNumber: true,
                          })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] font-normal text-amber-900 font-sans text-xs">
                        Trưởng kíp điện
                      </td>
                    </tr>

                    {/* Hàng 15: P Σ S1+S2 (MW) — TỰ ĐỘNG TÍNH */}
                    <tr className="bg-indigo-50/50 font-bold">
                      <td className="p-2 text-indigo-950 font-sans">P Σ S1+S2 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-2 text-center text-indigo-900 tabular-nums text-xs">
                          {format(tkdCalc[h.col]?.pSumS1S2)}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-slate-500 font-sans text-xs">
                        Tự động (S1+S2)
                      </td>
                    </tr>

                    {/* Hàng 16: P Σ T1+T2 (MW) — TỰ ĐỘNG TÍNH */}
                    <tr className="bg-indigo-50/50 font-bold">
                      <td className="p-2 text-indigo-950 font-sans">P Σ T1+T2 (MW)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MW</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-2 text-center text-indigo-900 tabular-nums text-xs">
                          {format(tkdCalc[h.col]?.pSumT1T2)}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-slate-500 font-sans text-xs">
                        Tự động (T1+T2)
                      </td>
                    </tr>

                    {/* Hàng 17: Q Σ S1+S2 (MVar) — TỰ ĐỘNG TÍNH */}
                    <tr className="bg-indigo-50/50 font-bold">
                      <td className="p-2 text-indigo-950 font-sans">Q Σ S1+S2 (MVar)</td>
                      <td className="p-2 text-center text-slate-500 text-xs">MVAr</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-2 text-center text-indigo-900 tabular-nums text-xs">
                          {format(tkdCalc[h.col]?.qSumS1S2)}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-slate-500 font-sans text-xs">
                        Tự động (Q1+Q2)
                      </td>
                    </tr>

                    {/* Hàng 18: Utc 220kV */}
                    <tr className="bg-blue-50/30">
                      <td className="p-2 font-semibold text-slate-800 font-sans">Utc 220kV</td>
                      <td className="p-2 text-center text-slate-500 text-xs">kV</td>
                      {TKD_HOURS.map(h => (
                        <td key={h.col} className="p-1.5 text-center text-xs">
                          {renderCellInput(`${h.col}20`, { isNumber: true })}
                        </td>
                      ))}
                      <td className="p-2 text-center text-[10px] text-blue-700 font-normal font-sans text-xs">
                        BCSX mục 1
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* BẢNG CÔNG TƠ NƯỚC DEMIN TẠI DCS (MỐC 24H) — HÀNG 72–74 */}
              <div className="mt-6 space-y-3 pt-4 border-t-2 border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-[#0f5132] flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#00b050]" />
                      Bảng công tơ nước demin tại DCS (Mốc 24h) — Hàng 72 đến 74
                    </h3>
                    <p className="text-xs text-slate-500">
                      Trưởng kíp điện nhập chỉ số công tơ 24h ngày D, lượng nước tái sinh hạt và số hiệu chỉnh (khi công tơ chạm dãy max 25.000 m³ reset về 0). Cột 24h ngày D-1 tự động kế thừa từ ngày trước. Lượng tiêu thụ ngày D tự động tính (X − W + Hiệu chỉnh).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                      Mốc 24h DCS
                    </span>
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                      TKĐ: Nhập tay
                    </span>
                    <span className="rounded-md bg-sky-100 px-2 py-0.5 font-bold text-sky-900">
                      Tự động tính
                    </span>
                  </div>
                </div>

                {(() => {
                  const numX72 = parseDeminNum(current["X72"]);
                  const numW72 = parseDeminNum(current["W72"] || previous?.["X72"]);
                  const isRolloverS1 = numX72 !== null && numW72 !== null && numX72 < numW72;

                  const numX73 = parseDeminNum(current["X73"]);
                  const numW73 = parseDeminNum(current["W73"] || previous?.["X73"]);
                  const isRolloverS2 = numX73 !== null && numW73 !== null && numX73 < numW73;

                  return (
                    <div className="overflow-x-auto rounded-xl border border-emerald-300 bg-white shadow-xs">
                      <table className="report-data-table w-full text-xs">
                        <thead>
                          <tr className="border-b bg-[#d1e7dd] text-[#0f5132]">
                            <th className="p-2.5 text-left font-bold min-w-[240px]">Thông số công tơ nước</th>
                            <th className="p-2.5 text-center font-bold w-32">
                              24h ngày D-1
                              <div className="text-[10px] font-normal text-emerald-700">(Cột W)</div>
                            </th>
                            <th className="p-2.5 text-center font-bold w-32">
                              24h ngày D
                              <div className="text-[10px] font-normal text-emerald-700">(Cột X)</div>
                            </th>
                            <th className="p-2.5 text-center font-bold w-36 bg-amber-100/70 text-amber-950">
                              Hiệu chỉnh (m³)
                              <div className="text-[10px] font-normal text-amber-800">(Mặc định 0 · Bù dãy 25.000)</div>
                            </th>
                            <th className="p-2.5 text-center font-bold w-36 bg-[#c3e6cb] text-[#0a3622]">
                              Lượng nước SD ngày D (m³)
                              <div className="text-[10px] font-normal text-emerald-800">(Cột Y = X − W + HC)</div>
                            </th>
                            <th className="p-2.5 text-center font-bold w-32">
                              Nước tái sinh hạt (m³)
                              <div className="text-[10px] font-normal text-emerald-700">(Cột Z)</div>
                            </th>
                            <th className="p-2.5 text-center font-bold min-w-[220px]">Lý do hiệu chỉnh / Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {/* Hàng 72: Tổ máy 1 */}
                          <tr className="hover:bg-emerald-50/30">
                            <td className="p-2.5 font-semibold text-slate-800 font-sans">
                              Công tơ nước demin tại DCS tổ máy 1
                              <span className="ml-1 text-[10px] text-slate-400 font-mono">(Hàng 72)</span>
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("W72", {
                                placeholder: previous?.["X72"] || "—",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("X72", {
                                placeholder: "Nhập 24h",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                            </td>
                            <td className="p-1.5 text-center bg-amber-50/30 text-xs">
                              {renderCellInput("WATER_ADJ_S1", {
                                placeholder: "0",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                              {isRolloverS1 && (!current["WATER_ADJ_S1"] || current["WATER_ADJ_S1"] === "0") && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    update("WATER_ADJ_S1", "25000");
                                    if (!current["WATER_ADJ_NOTE_S1"]) update("WATER_ADJ_NOTE_S1", "Reset về 0 qua mốc 25.000");
                                  }}
                                  className="mt-1 inline-flex items-center gap-1 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-300 border border-amber-400 shadow-2xs"
                                  title="Phát hiện X < W: Nhấn để bù tự động +25.000 m³ do đảo công tơ"
                                >
                                  ⚡ +25.000 (Reset)
                                </button>
                              )}
                            </td>
                            <td className="p-2 text-center font-normal font-mono text-emerald-900 bg-emerald-50/60 tabular-nums text-xs">
                              {formatDeminDiff(current["X72"], current["W72"] || previous?.["X72"], current["WATER_ADJ_S1"])}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("Z72", {
                                placeholder: linkedByDate[date]?.["Z72"] || "0",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                            </td>
                            <td className="p-1.5">
                              <div className="space-y-1">
                                {renderCellInput("WATER_ADJ_NOTE_S1", {
                                  placeholder: "Lý do hiệu chỉnh (nếu có)...",
                                  group: "tkd_trend",
                                  isNumber: false,
                                  maxLength: 500,
                                  className: "!text-left !font-sans !text-[11px]",
                                })}
                                {linkedByDate[date]?.["Z72"] !== undefined && (
                                  <div className="text-[10px] text-sky-700 font-bold flex items-center gap-1 pl-1" title="Tự động liên kết từ Báo cáo Theo dõi lượng nước">
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                    Link Lượng nước ({linkedByDate[date]["Z72"]} m³)
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Hàng 73: Tổ máy 2 */}
                          <tr className="hover:bg-emerald-50/30">
                            <td className="p-2.5 font-semibold text-slate-800 font-sans">
                              Công tơ nước demin tại DCS tổ máy 2
                              <span className="ml-1 text-[10px] text-slate-400 font-mono">(Hàng 73)</span>
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("W73", {
                                placeholder: previous?.["X73"] || "—",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("X73", {
                                placeholder: "Nhập 24h",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                            </td>
                            <td className="p-1.5 text-center bg-amber-50/30 text-xs">
                              {renderCellInput("WATER_ADJ_S2", {
                                placeholder: "0",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                              {isRolloverS2 && (!current["WATER_ADJ_S2"] || current["WATER_ADJ_S2"] === "0") && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    update("WATER_ADJ_S2", "25000");
                                    if (!current["WATER_ADJ_NOTE_S2"]) update("WATER_ADJ_NOTE_S2", "Reset về 0 qua mốc 25.000");
                                  }}
                                  className="mt-1 inline-flex items-center gap-1 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-300 border border-amber-400 shadow-2xs"
                                  title="Phát hiện X < W: Nhấn để bù tự động +25.000 m³ do đảo công tơ"
                                >
                                  ⚡ +25.000 (Reset)
                                </button>
                              )}
                            </td>
                            <td className="p-2 text-center font-normal font-mono text-emerald-900 bg-emerald-50/60 tabular-nums text-xs">
                              {formatDeminDiff(current["X73"], current["W73"] || previous?.["X73"], current["WATER_ADJ_S2"])}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("Z73", {
                                placeholder: linkedByDate[date]?.["Z73"] || "0",
                                group: "tkd_trend",
                                isNumber: true,
                              })}
                            </td>
                            <td className="p-1.5">
                              <div className="space-y-1">
                                {renderCellInput("WATER_ADJ_NOTE_S2", {
                                  placeholder: "Lý do hiệu chỉnh (nếu có)...",
                                  group: "tkd_trend",
                                  isNumber: false,
                                  maxLength: 500,
                                  className: "!text-left !font-sans !text-[11px]",
                                })}
                                {linkedByDate[date]?.["Z73"] !== undefined && (
                                  <div className="text-[10px] text-sky-700 font-bold flex items-center gap-1 pl-1" title="Tự động liên kết từ Báo cáo Theo dõi lượng nước">
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                    Link Lượng nước ({linkedByDate[date]["Z73"]} m³)
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Hàng 74: Tổng cả ngày của 2 tổ máy */}
                          <tr className="bg-[#e8f5e9] font-bold border-t-2 border-emerald-300">
                            <td className="p-2.5 text-emerald-950 font-sans font-bold">
                              Tổng lượng nước demin sử dụng của cả ngày D của 2 tổ máy
                              <span className="ml-1 text-[10px] text-emerald-700 font-mono">(Hàng 74)</span>
                            </td>
                            <td className="p-2 text-center text-slate-400 font-sans text-xs">—</td>
                            <td className="p-2 text-center text-slate-400 font-sans text-xs">—</td>
                            <td className="p-2 text-center font-normal font-mono text-amber-950 bg-amber-100/70 tabular-nums text-xs">
                              {formatAdjTotal(current["WATER_ADJ_S1"], current["WATER_ADJ_S2"])}
                            </td>
                            <td className="p-2 text-center font-normal font-mono text-emerald-950 bg-emerald-100/80 tabular-nums text-xs text-xs">
                              {formatDeminTotal(
                                current["X72"],
                                current["W72"] || previous?.["X72"],
                                current["WATER_ADJ_S1"],
                                current["X73"],
                                current["W73"] || previous?.["X73"],
                                current["WATER_ADJ_S2"],
                              )}
                            </td>
                            <td className="p-2 text-center font-normal font-mono text-emerald-950 bg-emerald-100/80 tabular-nums text-xs text-xs">
                              {formatResinTotal(current["Z72"], current["Z73"])}
                            </td>
                            <td className="p-2 text-center text-[11px] text-emerald-800 font-sans text-xs">
                              Tự động (Y72+Y73, Z72+Z73)
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: CỤM 4 & 5 — CÔNG TƠ TỔ MÁY S1 & S2 (TPD, LÒ PHÓ, MÁY NGHIỀN)        */}
          {/* ========================================================================= */}
          {activeTab === "unit_meters" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
                <div>
                  <h3 className="text-sm font-black text-[#173b64]">
                    Cụm 4 & 5: Bảng ghi công tơ Tổ máy S1 & Tổ máy S2
                  </h3>
      <button type="button" className="my-2 min-h-10 rounded-lg border border-blue-300 px-4 text-sm font-semibold text-blue-800" onClick={() => { const target = document.getElementById('ktkt-correction-requests'); if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({behavior:'smooth',block:'start'}); } }}>Đề xuất chỉnh sửa / Xem yêu cầu duyệt</button>
                  <p className="text-xs text-slate-500">
                    Phân tách thành 3 nhóm quyền riêng biệt: Trực phụ điện (Điện) · Lò phó (Dầu F1 -
                    F2) · Vận hành viên Máy nghiền (12 cân than A1..F2).
                  </p>
                </div>
                {/* Bộ chuyển tổ máy */}
                <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setUnitView("s1")}
                    className={`rounded-lg px-3 py-1.5 transition-all ${
                      unitView === "s1"
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-black"
                    }`}
                  >
                    Tổ máy S1
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitView("s2")}
                    className={`rounded-lg px-3 py-1.5 transition-all ${
                      unitView === "s2"
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-black"
                    }`}
                  >
                    Tổ máy S2
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitView("both")}
                    className={`rounded-lg px-3 py-1.5 transition-all ${
                      unitView === "both"
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-black"
                    }`}
                  >
                    Xem cả hai
                  </button>
                </div>
              </div>

              {(unitView === "s1" || unitView === "both") && (
                <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between border-b pb-2 mb-3">
                    <h4 className="text-sm font-black text-[#173b64]">
                      TỔ MÁY S1 — BẢNG CÔNG TƠ & CHỈ TIÊU VẬN HÀNH
                    </h4>
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                      Tổ máy 1
                    </span>
                  </div>

                  {/* 1. KHỐI ĐIỆN — TRỰC PHỤ ĐIỆN / TRỰC CHÍNH ĐIỆN NHẬP */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        1. Khối Điện: Công tơ MF, MBT T1, Tự dùng TD911, TD912
                      </span>
                      <span className="text-[11px] font-bold text-indigo-700">
                        Cương vị nhập: Trực phụ điện / Trực chính Điện
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="report-data-table w-full text-xs">
                        <thead>
                          <tr className="bg-[#f0f4f9] text-[#173b64]">
                            <th className="p-1.5 text-left font-bold">Tên công tơ S1</th>
                            <th className="p-1.5 text-center font-bold w-16">Đơn vị</th>
                            <th className="p-1.5 text-center font-bold">06h</th>
                            <th className="p-1.5 text-center font-bold">14h</th>
                            <th className="p-1.5 text-center font-bold">22h</th>
                            <th className="p-1.5 text-center font-bold">24h</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ máy phát (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("W8", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("Y8", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AA8", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AB8", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ điện MBT T1 (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("W9", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("Y9", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AA9", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AB9", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ điện tự dùng TD 911 (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("W10", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("Y10", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AA10", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AB10", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ điện tự dùng TD 912 (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("W11", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("Y11", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AA11", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AB11", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 2. KHỐI DẦU — LÒ PHÓ NHẬP */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        2. Khối Dầu: Công tơ dầu cấp lò F1 & dầu về bồn F2 (tấn)
                      </span>
                      <span className="text-[11px] font-bold text-amber-800">
                        Cương vị nhập: Lò phó
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="report-data-table w-full text-xs">
                        <thead>
                          <tr className="bg-[#fcf8f2] text-amber-950">
                            <th className="p-1.5 text-left font-bold">Chỉ số dầu S1 (tấn)</th>
                            {OIL_HOURS.map(h => (
                              <th key={h.label} className="p-1.5 text-center font-bold">
                                {h.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ dầu cấp lò F1 (t)
                            </td>
                            {OIL_HOURS.map(h => (
                              <td key={h.label} className="p-1.5 text-center text-xs">
                                {renderCellInput(`${h.colS1}13`, { group: "lo_pho_oil" })}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ dầu về bồn F2 (t)
                            </td>
                            {OIL_HOURS.map(h => (
                              <td key={h.label} className="p-1.5 text-center text-xs">
                                {renderCellInput(`${h.colS1}14`, { group: "lo_pho_oil" })}
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-amber-50/50 font-bold">
                            <td className="p-2 text-amber-900 font-sans">
                              Dầu tiêu thụ từng kỳ = ΔF1 - ΔF2 (t), kỳ 06h lấy mốc D-1
                            </td>
                            {oilS1.map(o => (
                              <td key={o.label} className="p-2 text-center text-amber-900 text-xs">
                                {format(o.diff)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 3. KHỐI THAN — VẬN HÀNH VIÊN MÁY NGHIỀN S1 NHẬP */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        3. Khối Than: 12 công tơ than Máy nghiền S1 (A1..F2)
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => setCoalPhotoOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100" title="Tải ảnh công tơ, web tự đọc số và điền vào bảng">
                          <Camera className="size-3.5" aria-hidden /> Đọc công tơ từ ảnh
                        </button>
                        <span className="text-[11px] font-bold text-slate-800">
                          Cương vị nhập: Vận hành viên Máy nghiền S1
                        </span>
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="report-data-table ktkt-coal-meter-table w-full text-xs"><colgroup><col style={{width:"20%"}}/><col span={3} style={{width:"14%"}}/><col span={4} style={{width:"9.5%"}}/></colgroup>
                        <thead>
                          <tr className="bg-[#f5f5f5] text-slate-800">
                            <th rowSpan={2} className="p-1.5 text-left font-bold">Mã cân than S1</th>
                            <th colSpan={3} className="border-l p-1.5 text-center font-bold">Chỉ số lũy kế (tấn)</th>
                            <th colSpan={4} className="border-l bg-sky-100 p-1.5 text-center font-bold text-[#173b64]">Tiêu thụ theo công tơ — chưa gồm hiệu chỉnh (tấn)</th>
                          </tr>
                          <tr className="bg-[#f5f5f5] text-slate-800">
                            <th className="border-l p-1.5 text-center font-bold">08h (Ca 1)</th>
                            <th className="p-1.5 text-center font-bold">16h (Ca 2)</th>
                            <th className="p-1.5 text-center font-bold">24h (Ca 3)</th>
                            <th className="border-l bg-sky-50 p-1.5 text-center font-bold" title="08h ngày D trừ 24h ngày D-1">Ca 1 (00–08h)</th>
                            <th className="bg-sky-50 p-1.5 text-center font-bold" title="16h trừ 08h ngày D">Ca 2 (08–16h)</th>
                            <th className="bg-sky-50 p-1.5 text-center font-bold" title="24h trừ 16h ngày D">Ca 3 (16–24h)</th>
                            <th className="bg-blue-100 p-1.5 text-center font-bold" title="24h ngày D trừ 24h ngày D-1">Tổng 3 ca</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {[
                            { code: "A1", row: 16 },
                            { code: "A2", row: 17 },
                            { code: "B1", row: 18 },
                            { code: "B2", row: 19 },
                            { code: "C1", row: 20 },
                            { code: "C2", row: 21 },
                            { code: "D1", row: 22 },
                            { code: "D2", row: 23 },
                            { code: "E1", row: 24 },
                            { code: "E2", row: 25 },
                            { code: "F1", row: 26 },
                            { code: "F2", row: 27 },
                          ].map(c => {
                            const consumption = calculateCoalMeterShiftConsumption(current, previous, "s1", c.row);
                            return <tr key={c.code} className="hover:bg-slate-50">
                              <td className="p-1.5 font-bold text-slate-800 font-sans">
                                Công tơ than # {c.code}
                              </td>
                              <td className="p-1 text-center text-xs">
                                {renderCellInput(`X${c.row}`, {
                                  group: "may_nghien_coal_s1",
                                })}
                              </td>
                              <td className="p-1 text-center text-xs">
                                {renderCellInput(`Z${c.row}`, {
                                  group: "may_nghien_coal_s1",
                                })}
                              </td>
                              <td className="p-1 text-center text-xs">
                                {renderCellInput(`AB${c.row}`, {
                                  group: "may_nghien_coal_s1",
                                })}
                              </td>
                              {[consumption.shift1, consumption.shift2, consumption.shift3].map((value, index) => (
                                <td key={index} className={`border-l p-2 text-center tabular-nums ${coalConsumptionCellClass(value)}`}>
                                  {format(value)}
                                </td>
                              ))}
                              <td className={`border-l p-2 text-center tabular-nums ${coalConsumptionCellClass(consumption.total, true)}`}>
                                {format(consumption.total)}
                              </td>
                            </tr>;
                          })}
                          <tr className="bg-amber-50/50">
                            <td className="p-2 font-bold text-amber-950 font-sans">
                              Hiệu chỉnh chênh lệch cân than (tấn, mặc định 0)
                            </td>
                            {(["W28", "Y28", "AA28"] as const).map(cell => (
                              <td key={cell} className="p-1 text-center text-xs">
                                {renderCellInput(cell, { group: "may_nghien_coal_s1" })}
                              </td>
                            ))}
                            <td colSpan={4} className="bg-sky-50/40 p-2 text-center font-sans text-slate-500 text-xs">Không phân bổ tự động theo từng công tơ</td>
                          </tr>
                          <tr className="bg-amber-50/30">
                            <td className="p-2 font-bold text-amber-950 font-sans">
                              Lý do hiệu chỉnh (máy cấp / giá trị)
                            </td>
                            <td colSpan={7} className="p-1">
                              {renderCellInput("COAL_ADJ_NOTE_S1", {
                                group: "may_nghien_coal_s1",
                                isNumber: false,
                                placeholder: "Ví dụ: Máy cấp 1B1, cộng 12,5 tấn do cân lệch",
                                maxLength: 500,
                                className: "!text-left !font-sans !font-medium",
                              })}
                            </td>
                          </tr>
                          <tr className="bg-slate-100 font-black">
                            <td className="p-2 text-slate-900 font-sans">
                              Lượng than tiêu thụ - tấn (S1)
                            </td>
                            <td colSpan={7} className="p-2 text-center text-indigo-900 font-mono text-xs">
                              Tổng ngày: {format(summary.s1.rawCoalTonnes)} tấn
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 4. CHỈ SỐ THỐNG KÊ TỔ MÁY S1 */}
                  <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-200">
                    <span className="font-bold text-[#173b64] block mb-2">
                      Chỉ số thống kê tự động - Tổ máy S1:
                    </span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 font-mono">
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Sản lượng điện MF:
                        </span>
                        <b className="text-indigo-900">{format(summary.s1.grossMwh)} MWh</b>
                      </div>
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Điện giao MBT T1:
                        </span>
                        <b className="text-indigo-900">{format(summary.s1.netMwh)} MWh</b>
                      </div>
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Tổng tự dùng S1:
                        </span>
                        <b className="text-indigo-900">{format(summary.s1.auxiliaryMwh)} MWh</b>
                      </div>
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Tỷ lệ tự dùng:
                        </span>
                        <b className="text-indigo-900">
                          {format(summary.s1.auxiliaryPercent)} %
                        </b>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(unitView === "s2" || unitView === "both") && (
                <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between border-b pb-2 mb-3">
                    <h4 className="text-sm font-black text-[#173b64]">
                      TỔ MÁY S2 — BẢNG CÔNG TƠ & CHỈ TIÊU VẬN HÀNH
                    </h4>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Tổ máy 2
                    </span>
                  </div>

                  {/* 1. KHỐI ĐIỆN S2 */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        1. Khối Điện: Công tơ MF, MBT T2, Tự dùng TD921, TD922
                      </span>
                      <span className="text-[11px] font-bold text-indigo-700">
                        Cương vị nhập: Trực phụ điện / Trực chính Điện
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="report-data-table w-full text-xs">
                        <thead>
                          <tr className="bg-[#f0f4f9] text-[#173b64]">
                            <th className="p-1.5 text-left font-bold">Tên công tơ S2</th>
                            <th className="p-1.5 text-center font-bold w-16">Đơn vị</th>
                            <th className="p-1.5 text-center font-bold">06h</th>
                            <th className="p-1.5 text-center font-bold">14h</th>
                            <th className="p-1.5 text-center font-bold">22h</th>
                            <th className="p-1.5 text-center font-bold">24h</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ máy phát (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AG8", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AI8", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AK8", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AL8", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ điện MBT T2 (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AG9", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AI9", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AK9", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AL9", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ điện tự dùng TD 921 (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AG10", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AI10", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AK10", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AL10", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ điện tự dùng TD 922 (MWh)
                            </td>
                            <td className="p-2 text-center text-slate-500 text-xs">MWh</td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AG11", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AI11", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AK11", { group: "tpd_tcd_power" })}
                            </td>
                            <td className="p-1.5 text-center text-xs">
                              {renderCellInput("AL11", { group: "tpd_tcd_power" })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 2. KHỐI DẦU S2 (Đơn vị: kg) */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        2. Khối Dầu: Công tơ dầu cấp lò F1 & dầu về bồn F2 (kg)
                      </span>
                      <span className="text-[11px] font-bold text-amber-800">
                        Cương vị nhập: Lò phó
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="report-data-table w-full text-xs">
                        <thead>
                          <tr className="bg-[#fcf8f2] text-amber-950">
                            <th className="p-1.5 text-left font-bold">Chỉ số dầu S2 (kg)</th>
                            {OIL_HOURS.map(h => (
                              <th key={h.label} className="p-1.5 text-center font-bold">
                                {h.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ dầu cấp lò F1 (kg)
                            </td>
                            {OIL_HOURS.map(h => (
                              <td key={h.label} className="p-1.5 text-center text-xs">
                                {renderCellInput(`${h.colS2}13`, { group: "lo_pho_oil" })}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold text-slate-800 font-sans">
                              Công tơ dầu về bồn F2 (kg)
                            </td>
                            {OIL_HOURS.map(h => (
                              <td key={h.label} className="p-1.5 text-center text-xs">
                                {renderCellInput(`${h.colS2}14`, { group: "lo_pho_oil" })}
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-amber-50/50 font-bold">
                            <td className="p-2 text-amber-900 font-sans">
                              Dầu tiêu thụ từng kỳ = ΔF1 - ΔF2 (kg), kỳ 06h lấy mốc D-1
                            </td>
                            {oilS2.map(o => (
                              <td key={o.label} className="p-2 text-center text-amber-900 text-xs">
                                {format(o.diff)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 3. KHỐI THAN S2 */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        3. Khối Than: 12 công tơ than Máy nghiền S2 (A1..F2)
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => setCoalPhotoOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100" title="Tải ảnh công tơ, web tự đọc số và điền vào bảng">
                          <Camera className="size-3.5" aria-hidden /> Đọc công tơ từ ảnh
                        </button>
                        <span className="text-[11px] font-bold text-slate-800">
                          Cương vị nhập: Vận hành viên Máy nghiền S2
                        </span>
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="report-data-table ktkt-coal-meter-table w-full text-xs"><colgroup><col style={{width:"20%"}}/><col span={3} style={{width:"14%"}}/><col span={4} style={{width:"9.5%"}}/></colgroup>
                        <thead>
                          <tr className="bg-[#f5f5f5] text-slate-800">
                            <th rowSpan={2} className="p-1.5 text-left font-bold">Mã cân than S2</th>
                            <th colSpan={3} className="border-l p-1.5 text-center font-bold">Chỉ số lũy kế (tấn)</th>
                            <th colSpan={4} className="border-l bg-sky-100 p-1.5 text-center font-bold text-[#173b64]">Tiêu thụ theo công tơ — chưa gồm hiệu chỉnh (tấn)</th>
                          </tr>
                          <tr className="bg-[#f5f5f5] text-slate-800">
                            <th className="border-l p-1.5 text-center font-bold">08h (Ca 1)</th>
                            <th className="p-1.5 text-center font-bold">16h (Ca 2)</th>
                            <th className="p-1.5 text-center font-bold">24h (Ca 3)</th>
                            <th className="border-l bg-sky-50 p-1.5 text-center font-bold" title="08h ngày D trừ 24h ngày D-1">Ca 1 (00–08h)</th>
                            <th className="bg-sky-50 p-1.5 text-center font-bold" title="16h trừ 08h ngày D">Ca 2 (08–16h)</th>
                            <th className="bg-sky-50 p-1.5 text-center font-bold" title="24h trừ 16h ngày D">Ca 3 (16–24h)</th>
                            <th className="bg-blue-100 p-1.5 text-center font-bold" title="24h ngày D trừ 24h ngày D-1">Tổng 3 ca</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {[
                            { code: "A1", row: 16 },
                            { code: "A2", row: 17 },
                            { code: "B1", row: 18 },
                            { code: "B2", row: 19 },
                            { code: "C1", row: 20 },
                            { code: "C2", row: 21 },
                            { code: "D1", row: 22 },
                            { code: "D2", row: 23 },
                            { code: "E1", row: 24 },
                            { code: "E2", row: 25 },
                            { code: "F1", row: 26 },
                            { code: "F2", row: 27 },
                          ].map(c => {
                            const consumption = calculateCoalMeterShiftConsumption(current, previous, "s2", c.row);
                            return <tr key={c.code} className="hover:bg-slate-50">
                              <td className="p-1.5 font-bold text-slate-800 font-sans">
                                Công tơ than # {c.code}
                              </td>
                              <td className="p-1 text-center text-xs">
                                {renderCellInput(`AH${c.row}`, {
                                  group: "may_nghien_coal_s2",
                                })}
                              </td>
                              <td className="p-1 text-center text-xs">
                                {renderCellInput(`AJ${c.row}`, {
                                  group: "may_nghien_coal_s2",
                                })}
                              </td>
                              <td className="p-1 text-center text-xs">
                                {renderCellInput(`AL${c.row}`, {
                                  group: "may_nghien_coal_s2",
                                })}
                              </td>
                              {[consumption.shift1, consumption.shift2, consumption.shift3].map((value, index) => (
                                <td key={index} className={`border-l p-2 text-center tabular-nums ${coalConsumptionCellClass(value)}`}>
                                  {format(value)}
                                </td>
                              ))}
                              <td className={`border-l p-2 text-center tabular-nums ${coalConsumptionCellClass(consumption.total, true)}`}>
                                {format(consumption.total)}
                              </td>
                            </tr>;
                          })}
                          <tr className="bg-amber-50/50">
                            <td className="p-2 font-bold text-amber-950 font-sans">
                              Hiệu chỉnh chênh lệch cân than (tấn, mặc định 0)
                            </td>
                            {(["AG28", "AI28", "AK28"] as const).map(cell => (
                              <td key={cell} className="p-1 text-center text-xs">
                                {renderCellInput(cell, { group: "may_nghien_coal_s2" })}
                              </td>
                            ))}
                            <td colSpan={4} className="bg-sky-50/40 p-2 text-center font-sans text-slate-500 text-xs">Không phân bổ tự động theo từng công tơ</td>
                          </tr>
                          <tr className="bg-amber-50/30">
                            <td className="p-2 font-bold text-amber-950 font-sans">
                              Lý do hiệu chỉnh (máy cấp / giá trị)
                            </td>
                            <td colSpan={7} className="p-1">
                              {renderCellInput("COAL_ADJ_NOTE_S2", {
                                group: "may_nghien_coal_s2",
                                isNumber: false,
                                placeholder: "Ví dụ: Máy cấp 2A2, trừ 8,0 tấn do kiểm tra cân",
                                maxLength: 500,
                                className: "!text-left !font-sans !font-medium",
                              })}
                            </td>
                          </tr>
                          <tr className="bg-slate-100 font-black">
                            <td className="p-2 text-slate-900 font-sans">
                              Lượng than tiêu thụ - tấn (S2)
                            </td>
                            <td colSpan={7} className="p-2 text-center text-indigo-900 font-mono text-xs">
                              Tổng ngày: {format(summary.s2.rawCoalTonnes)} tấn
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 4. CHỈ SỐ THỐNG KÊ S2 */}
                  <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-200">
                    <span className="font-bold text-[#173b64] block mb-2">
                      Chỉ số thống kê tự động - Tổ máy S2:
                    </span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 font-mono">
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Sản lượng điện MF:
                        </span>
                        <b className="text-indigo-900">{format(summary.s2.grossMwh)} MWh</b>
                      </div>
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Điện giao MBT T2:
                        </span>
                        <b className="text-indigo-900">{format(summary.s2.netMwh)} MWh</b>
                      </div>
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Tổng tự dùng S2:
                        </span>
                        <b className="text-indigo-900">{format(summary.s2.auxiliaryMwh)} MWh</b>
                      </div>
                      <div className="rounded bg-white p-2 border">
                        <span className="text-[11px] text-slate-500 font-sans block">
                          Tỷ lệ tự dùng:
                        </span>
                        <b className="text-indigo-900">
                          {format(summary.s2.auxiliaryPercent)} %
                        </b>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: CỤM 6 & 8 — LƯU LƯỢNG HƠI & BỒN NH3                                 */}
          {/* ========================================================================= */}
          {activeTab === "steam_nh3" && (
            <div className="space-y-6">
              {/* CỤM 6: LƯU LƯỢNG HƠI */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#173b64]">
                      Cụm 6: Bảng thống kê Lưu lượng hơi Tổ máy S1 & Tổ máy S2
                    </h3>
                    <p className="text-xs text-slate-500">
                      Trưởng kíp điện nhập Tổng lưu lượng hơi tại 6 mốc: 06h, 10h, 14h, 18h, 22h,
                      24h. Dòng sản lượng hơi tiêu thụ tự động tính theo chênh lệch các mốc.
                    </p>
                  </div>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                    Trưởng kíp điện
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="report-data-table w-full text-xs">
                    <thead>
                      <tr className="bg-[#f0f4f9] text-[#173b64]">
                        <th className="p-2 text-left font-bold w-64">Chỉ tiêu hơi</th>
                        {STEAM_HOURS.map(h => (
                          <th key={h.label} className="p-2 text-center font-bold">
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {/* S1 Tổng lưu lượng hơi */}
                      <tr>
                        <td className="p-2 font-bold text-slate-800 font-sans">
                          Tổng lưu lượng hơi S1 (tấn)
                        </td>
                        {STEAM_HOURS.map(h => (
                          <td key={h.label} className="p-1.5 text-center text-xs">
                            {renderCellInput(`${h.colS1}54`, { group: "steam_flow" })}
                          </td>
                        ))}
                      </tr>
                      {/* S1 Sản lượng hơi tiêu thụ */}
                      <tr className="bg-slate-50 font-bold text-indigo-900">
                        <td className="p-2 font-sans">Sản lượng hơi S1 tiêu thụ (tấn)</td>
                        {steamS1.map(s => (
                          <td key={s.label} className="p-2 text-center tabular-nums text-xs">
                            {format(s.consumption)}
                          </td>
                        ))}
                      </tr>

                      {/* S2 Tổng lưu lượng hơi */}
                      <tr>
                        <td className="p-2 font-bold text-slate-800 font-sans">
                          Tổng lưu lượng hơi S2 (tấn)
                        </td>
                        {STEAM_HOURS.map(h => (
                          <td key={h.label} className="p-1.5 text-center text-xs">
                            {renderCellInput(`${h.colS2}54`, { group: "steam_flow" })}
                          </td>
                        ))}
                      </tr>
                      {/* S2 Sản lượng hơi tiêu thụ */}
                      <tr className="bg-slate-50 font-bold text-indigo-900">
                        <td className="p-2 font-sans">Sản lượng hơi S2 tiêu thụ (tấn)</td>
                        {steamS2.map(s => (
                          <td key={s.label} className="p-2 text-center tabular-nums text-xs">
                            {format(s.consumption)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CỤM 8: TỔNG LƯỢNG NH3 */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#173b64]">
                      Cụm 8: Tổng lượng NH3 dùng trong ngày
                    </h3>
                    <p className="text-xs text-slate-500">
                      Vận hành viên NH3 và Trưởng kíp điện nhập Mức bồn 00h và 24h của Bồn A, B, C và
                      Tổng lượng NH3 nhập trong ngày (tấn).
                    </p>
                  </div>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                    VHV NH3 · Trưởng kíp điện
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {/* Bảng mức bồn */}
                  <div className="overflow-x-auto rounded-lg border md:col-span-2">
                    <table className="report-data-table w-full text-xs">
                      <thead>
                        <tr className="bg-[#f0f4f9] text-[#173b64]">
                          <th className="p-2 text-left font-bold">Bồn NH3</th>
                          <th className="p-2 text-center font-bold">Mức 00h (mm)</th>
                          <th className="p-2 text-center font-bold">Mức 24h (mm)</th>
                          <th className="p-2 text-center font-bold">Khối lượng (tấn)</th>
                          <th className="p-2 text-center font-bold">Khả dụng 24h (tấn)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        <tr>
                          <td className="p-2 font-bold text-slate-800 font-sans">Bồn A</td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("N69", { group: "nh3_tank" })}
                          </td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("O69", { group: "nh3_tank" })}
                          </td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("P69", { group: "nh3_tank" })}
                          </td>
                          <td className="p-2 text-center font-normal text-indigo-900 text-xs">
                            {format(nh3.tankAvailable[0])}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 font-bold text-slate-800 font-sans">Bồn B</td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("N70", { group: "nh3_tank" })}
                          </td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("O70", { group: "nh3_tank" })}
                          </td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("P70", { group: "nh3_tank" })}
                          </td>
                          <td className="p-2 text-center font-normal text-indigo-900 text-xs">
                            {format(nh3.tankAvailable[1])}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 font-bold text-slate-800 font-sans">Bồn C</td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("N71", { group: "nh3_tank" })}
                          </td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("O71", { group: "nh3_tank" })}
                          </td>
                          <td className="p-1.5 text-center text-xs">
                            {renderCellInput("P71", { group: "nh3_tank" })}
                          </td>
                          <td className="p-2 text-center font-normal text-indigo-900 text-xs">
                            {format(nh3.tankAvailable[2])}
                          </td>
                        </tr>
                        <tr className="border-t-2 border-slate-300 bg-indigo-50/70">
                          <td className="p-2 font-black text-[#173b64] font-sans" colSpan={3}>
                            Tổng 3 bồn
                          </td>
                          <td className="p-2 text-center font-normal text-[#173b64] text-xs">
                            {format(nh3.tankMassTotal)}
                          </td>
                          <td className="p-2 text-center font-normal text-indigo-900 text-xs">
                            {format(nh3.tankAvailableTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Tổng hợp tồn & nhập NH3 */}
                  <div className="rounded-lg bg-slate-50 p-3 text-xs border border-slate-200 space-y-2.5">
                    <span className="font-bold text-[#173b64] block">
                      Số liệu nhập & sử dụng NH3:
                    </span>
                    <label className="block">
                      <span className="text-slate-600 block mb-1">
                        Tổng lượng NH3 nhập trong ngày (tấn):
                      </span>
                      {renderCellInput("P72", { group: "nh3_tank" })}
                    </label>

                    <label className="block">
                      <span className="text-slate-600 block mb-1">
                        Tổng lượng NH3 tồn kho 00h (tấn):
                      </span>
                      {renderCellInput("P73", { group: "nh3_tank" })}
                      <span className="mt-1 block text-[11px] text-blue-700">
                        Tự lấy từ tồn kho 24h00 ngày {previousDate.split("-").reverse().join("/")}.
                      </span>
                    </label>

                    <div className="rounded bg-white p-2 border font-mono">
                      <span className="text-[11px] text-slate-500 font-sans block">
                        Tồn kho 24h00 (tấn):
                      </span>
                      <div data-nh3-stock-24h className="text-center text-xs text-indigo-900">
                        {format(nh3.stock24h)}
                      </div>
                      <span className="mt-1 block text-[11px] text-slate-500 font-sans">
                        {isMissingValue(current["P74"])
                          ? "Tổng hợp từ số liệu ba bồn đã nhập; chưa nhập trực tiếp P74."
                          : "Dùng số liệu nhập trực tiếp P74."}
                      </span>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-slate-600">
                        Tồn kho 24h nhập trực tiếp — P74 (tấn):
                      </span>
                      {renderCellInput("P74", { group: "nh3_tank" })}
                    </label>

                    <div className="rounded bg-white p-2 border font-mono">
                      <span className="text-[11px] text-slate-500 font-sans block">
                        Tổng NH3 đã dùng (tấn):
                      </span>
                      <b className="text-emerald-800">
                        {format(nh3.usedTonnes)}
                      </b>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#173b64]">
                      Tổng lượng NH3 dùng trong ngày tính theo công tơ trên DCS
                    </h3>
                    <p className="text-xs text-slate-500">
                      Lò trưởng hoặc Trưởng kíp điện nhập chỉ số 00h và 24h. Nếu công tơ quay về 0, nhập mức reset (thường 500 tấn/lần); để trống khi không reset.
                    </p>
                  </div>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    Lò trưởng / Trưởng kíp điện
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="report-data-table w-full min-w-[1080px] text-xs">
                    <thead>
                      <tr className="bg-[#f0f4f9] text-[#173b64]">
                        <th className="p-2 text-left font-bold">Tổ máy</th>
                        <th className="p-2 text-center font-bold">Công tơ 24h ngày {previousDate.split("-").reverse().join("/")} · tự lấy (tấn)</th>
                        <th className="p-2 text-center font-bold">Công tơ 24h ngày {date.split("-").reverse().join("/")} (tấn)</th>
                        <th className="p-2 text-center font-bold">Hiệu chỉnh reset (tấn)</th>
                        <th className="p-2 text-center font-bold">Đã dùng (tấn)</th>
                        <th className="p-2 text-center font-bold">Đầu cực MF (MWh)</th>
                        <th className="p-2 text-center font-bold">MBA (MWh)</th>
                        <th className="p-2 text-center font-bold">NH3 tiêu thụ (kg)</th>
                        <th className="p-2 text-center font-bold">Suất hao đầu cực (g/kWh)</th>
                        <th className="p-2 text-center font-bold">Suất hao trên lưới (g/kWh)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {([
                        { label: "S1", endCell: "N81", correctionCell: "NH3_DCS_RESET_S1", data: nh3Dcs.s1 },
                        { label: "S2", endCell: "N82", correctionCell: "NH3_DCS_RESET_S2", data: nh3Dcs.s2 },
                      ] as const).map(row => (
                        <tr key={row.label}>
                          <td className="p-2 font-bold text-slate-800 font-sans">Tổ máy {row.label}</td>
                          <td className="bg-blue-50 p-2 text-center font-normal text-blue-800 text-xs" title="Tự lấy từ công tơ 24h ngày D-1">
                            {format(row.data?.startTonnes ?? null)}
                          </td>
                          <td className="p-1.5 text-center text-xs">{renderCellInput(row.endCell, { group: "nh3_dcs" })}</td>
                          <td className="p-1.5 text-center text-xs">{renderCellInput(row.correctionCell, { group: "nh3_dcs", placeholder: "0", isNumber: true })}</td>
                          <td className="p-2 text-center font-normal text-emerald-800 text-xs">{format(row.data?.usedTonnes ?? null)}</td>
                          <td className="p-2 text-center text-xs">{format(row.data?.grossMwh ?? null)}</td>
                          <td className="p-2 text-center text-xs">{format(row.data?.netMwh ?? null)}</td>
                          <td className="p-2 text-center text-xs">{format(row.data?.usedKg ?? null)}</td>
                          <td className="p-2 text-center text-xs">{format(row.data?.rateGross ?? null)}</td>
                          <td className="p-2 text-center text-xs">{format(row.data?.rateNet ?? null)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300 bg-emerald-50/70">
                        <td className="p-2 font-black text-[#173b64] font-sans" colSpan={4}>Tổng NH3 DCS S1 + S2</td>
                        <td className="p-2 text-center font-normal text-emerald-900 text-xs">{format(nh3Dcs.totalUsedTonnes)}</td>
                        <td className="p-2" colSpan={5}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: CỤM 9 & 14 — ĐIỆN TỰ DÙNG TD21 & THAN TRỘN PMIS                     */}
          {/* ========================================================================= */}
          {activeTab === "td21_coal_blend" && (
            <div className="space-y-6">
              {/* CỤM 9: CÔNG TƠ TD21 */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#173b64]">
                      Cụm 9: Công tơ điện tự dùng - TD21
                    </h3>
                    <p className="text-xs text-slate-500">
                      Trực phụ điện nhập chỉ số tại 4 mốc: 06h, 14h, 22h, 24h.
                    </p>
                  </div>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                    Trực phụ điện
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border max-w-xl">
                  <table className="report-data-table w-full text-xs">
                    <thead>
                      <tr className="bg-[#f0f4f9] text-[#173b64]">
                        <th className="p-2 text-left font-bold">Tên công tơ</th>
                        <th className="p-2 text-center font-bold">06h</th>
                        <th className="p-2 text-center font-bold">14h</th>
                        <th className="p-2 text-center font-bold">22h</th>
                        <th className="p-2 text-center font-bold">24h</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr>
                        <td className="p-2 font-bold text-slate-800 font-sans">
                          Công tơ điện tự dùng - TD21
                        </td>
                        <td className="p-1.5 text-center text-xs">
                          {renderCellInput("M49", { group: "td21" })}
                        </td>
                        <td className="p-1.5 text-center text-xs">
                          {renderCellInput("O49", { group: "td21" })}
                        </td>
                        <td className="p-1.5 text-center text-xs">
                          {renderCellInput("Q49", { group: "td21" })}
                        </td>
                        <td className="p-1.5 text-center text-xs">
                          {renderCellInput("R49", { group: "td21" })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CỤM 14: THAN TRỘN PMIS */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-[#173b64]">
                      Cụm 14: Bảng than 6A10 theo ca
                    </h3>
                    <p className="text-xs text-slate-500">
                      Bố cục theo file Excel: chỉ nhập độ ẩm Wtp và nhiệt trị khô Qk; khối lượng than
                      chưa quy ẩm, quy ẩm 8,5% và nhiệt trị thực tế được tính tự động.
                    </p>
                  </div>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                    Trưởng kíp điện
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="report-data-table min-w-[980px] w-full text-xs">
                    <thead>
                      <tr className="bg-[#f0f4f9] text-[#173b64]">
                        <th className="p-2 text-center font-bold">Tổ máy</th>
                        <th className="p-2 text-center font-bold">Ca</th>
                        <th className="p-2 text-center font-bold">Than chưa quy ẩm (t)</th>
                        <th className="p-2 text-center font-bold bg-yellow-50">Ẩm toàn phần Wtp (%)</th>
                        <th className="p-2 text-center font-bold bg-yellow-50">Nhiệt trị khô Qk (kcal/kg)</th>
                        <th className="p-2 text-center font-bold">Than quy ẩm 8,5% (t)</th>
                        <th className="p-2 text-center font-bold">Nhiệt trị thực tế (kcal/kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {coalShiftDetails.map((item, index) => {
                        const row = 87 + index;
                        return (
                          <tr key={`${item.unit}-${item.shift}`} className={item.unit === "S2" ? "bg-slate-50/60" : "bg-white"}>
                            <td className="p-2 text-center font-sans font-extrabold text-[#173b64] text-xs">{item.unit}</td>
                            <td className="p-2 text-center font-sans font-normal text-xs">Ca {item.shift}</td>
                            <td className="p-2 text-center tabular-nums text-xs">{format(item.rawCoalTonnes)}</td>
                            <td className="p-1.5 bg-yellow-50/60">{renderCellInput(`AJ${row}`, { group: "coal_blend_pmis" })}</td>
                            <td className="p-1.5 bg-yellow-50/60">{renderCellInput(`AK${row}`, { group: "coal_blend_pmis" })}</td>
                            <td className="p-2 text-center tabular-nums text-xs">{format(item.adjustedCoalTonnes)}</td>
                            <td className="p-2 text-center tabular-nums text-xs">{format(item.asReceivedKcalKg)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: CỤM 11 — BẢNG CÔNG TƠ THEO SỰ KIỆN                                  */}
          {/* ========================================================================= */}
          {activeTab === "startup_shutdown" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-xs">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-amber-950">
                      Công tơ điện khi khởi động / ngừng tổ máy
                    </h3>
                    <p className="text-xs text-amber-900">
                      Chọn tổ máy và sự kiện. Mỗi mốc giờ có một bảng chỉ số công tơ; số liệu được đưa về đúng cột sự kiện trong sheet ngày.
                    </p>
                  </div>
                  <span className="rounded-md bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                    TKĐ · TCĐ · TPĐ
                  </span>
                </div>

                <div className="grid gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="grid gap-1 text-xs font-bold text-amber-950">
                    Tổ máy
                    <select value={operationUnit} onChange={event => setOperationUnit(event.target.value as CtktktOperationUnit)} disabled={loading || saving} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-sm">
                      {STARTUP_UNITS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-amber-950">
                    Sự kiện
                    <select value={operationKind} onChange={event => setOperationKind(event.target.value as CtktktOperationKind)} disabled={loading || saving} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-sm">
                      {OPERATION_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  {!selectedOperationEvent && (
                    <button type="button" onClick={addOperationEvent} disabled={!canEditOperationEvents || loading || saving} className="h-9 rounded-lg bg-amber-700 px-4 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50">
                      Tạo bảng sự kiện
                    </button>
                  )}
                </div>

                {operationEvents.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {operationEvents.map(event => {
                      const label = OPERATION_KINDS.find(item => item.value === event.kind)?.label || event.kind;
                      const selected = event.unit === operationUnit && event.kind === operationKind;
                      return (
                        <button key={ctktktOperationEventId(event.unit, event.kind)} type="button" onClick={() => { setOperationUnit(event.unit); setOperationKind(event.kind); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? "border-amber-700 bg-amber-700 text-white" : "border-amber-200 bg-white text-amber-900 hover:bg-amber-50"}`}>
                          {event.unit} · {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!selectedOperationEvent ? (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600">
                    Chọn tổ máy và loại sự kiện rồi tạo bảng để nhập. Mỗi loại sự kiện của mỗi tổ máy có một bảng trong ngày.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                      <div className="text-xs font-bold text-sky-950">Mốc thời gian · {selectedOperationEvent.unit} · {OPERATION_KINDS.find(item => item.value === selectedOperationEvent.kind)?.label}</div>
                      <button type="button" onClick={() => deleteOperationEvent(selectedOperationEvent)} disabled={!canEditOperationEvents || loading || saving} className="rounded-md px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Xóa bảng sự kiện</button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {(Object.keys(CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind]) as CtktktOperationPoint[]).map(point => {
                        const reading = selectedOperationEvent.points[point];
                        return (
                          <label key={point} className="grid gap-1 rounded-lg border border-sky-200 bg-white p-3 text-xs font-bold text-slate-700">
                            {CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind][point]}
                            <input type="datetime-local" value={reading?.time || ""} onChange={event => updateOperationPoint(point, { time: event.target.value })} disabled={!canEditOperationEvents || loading || saving} className="h-9 min-w-0 rounded-md border border-slate-300 px-2 font-medium disabled:bg-slate-100" />
                          </label>
                        );
                      })}
                    </div>

                    {CTKTKT_OPERATION_ELECTRICAL_POINTS[selectedOperationEvent.kind].length > 0 && (
                      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="border-b bg-slate-50 px-3 py-2">
                          <h4 className="text-xs font-black text-slate-800">Bảng công tơ máy phát và máy biến áp · sheet ngày, dòng 59–83</h4>
                          <p className="mt-0.5 text-[10px] text-slate-500">Mốc và số liệu sẽ xuất theo đúng cột sự kiện S1/S2 trong biểu mẫu.</p>
                        </div>
                        <div className="max-h-[440px] overflow-auto">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead className="sticky top-0 z-10 bg-white text-[10px] text-slate-500 shadow-sm">
                              <tr>
                                <th className="sticky left-0 z-20 min-w-64 bg-white px-3 py-2 text-left">Công tơ / ô Excel</th>
                                {CTKTKT_OPERATION_ELECTRICAL_POINTS[selectedOperationEvent.kind].map(point => (
                                  <th key={point} className="min-w-40 border-l px-2 py-2 text-center">
                                    {CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind][point]}
                                    <span className="mt-1 block font-normal text-slate-400">{selectedOperationEvent.points[point]?.time.replace("T", " ") || "Chưa chọn thời điểm"}</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {CTKTKT_EVENT_POWER_ROWS.map(item => (
                                <tr key={item.row} className="odd:bg-white even:bg-slate-50/60">
                                  <th className="sticky left-0 z-[1] bg-inherit px-3 py-1.5 text-left font-semibold text-slate-700">{item.label}</th>
                                  {CTKTKT_OPERATION_ELECTRICAL_POINTS[selectedOperationEvent.kind].map(point => {
                                    const column = ctktktOperationPowerColumn(selectedOperationEvent, point);
                                    const cell = column ? `${column}${item.row}` : "";
                                    const enabled = canEditOperationEvents && (!((item.row === 83) && !(selectedOperationEvent.kind === "startup" && point === "grid_sync")));
                                    const value = selectedOperationEvent.points[point]?.power[String(item.row)] || "";
                                    return (
                                      <td key={point} className="border-l px-2 py-1.5">
                                        {enabled ? (
                                          <>
                                            <input type="number" step="any" value={value} onChange={event => updateOperationPoint(point, { power: { ...(selectedOperationEvent.points[point]?.power || {}), [item.row]: event.target.value } })} disabled={loading || saving} className="h-8 w-full rounded border border-[#173b64] px-2 text-center font-mono text-sm font-bold focus:border-[#173b64] focus:outline-none disabled:bg-slate-100" />
                                            <code className="mt-0.5 block text-center text-[9px] text-slate-400">{cell}</code>
                                          </>
                                        ) : <span className="block py-1 text-center text-slate-300">—</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    <section className="overflow-hidden rounded-xl border border-orange-200 bg-white">
                      <div className="border-b border-orange-100 bg-orange-50/70 px-3 py-2">
                        <h4 className="text-xs font-black text-orange-950">Bảng công tơ dầu và thời điểm · sheet ngày, dòng 85–110</h4>
                        <p className="mt-0.5 text-[10px] text-orange-800">Số tiêu thụ theo từng giai đoạn tính đúng công thức của mẫu Excel; các ô công thức vẫn được giữ khi xuất.</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-xs">
                          <thead className="bg-white text-[10px] text-slate-500">
                            <tr>
                              <th className="min-w-56 px-3 py-2 text-left">Công tơ dầu / ô Excel</th>
                              {ctktktOperationOilCells(selectedOperationEvent).map(item => (
                                <th key={item.point} className="min-w-36 border-l px-2 py-2 text-center">
                                  {CTKTKT_OPERATION_POINT_LABELS[selectedOperationEvent.kind][item.point]}
                                  <span className="mt-1 block font-normal text-slate-400">{selectedOperationEvent.points[item.point]?.time.replace("T", " ") || "Chưa chọn thời điểm"}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {([
                              { key: "oilFeed", label: "Công tơ dầu cấp lò" },
                              { key: "oilReturn", label: "Công tơ dầu hồi lò" },
                            ] as const).map(row => (
                              <tr key={row.key}>
                                <th className="px-3 py-2 text-left font-semibold text-slate-700">{row.label}</th>
                                {ctktktOperationOilCells(selectedOperationEvent).map(item => {
                                  const value = selectedOperationEvent.points[item.point]?.[row.key] || "";
                                  const cell = row.key === "oilFeed" ? item.feedCell : item.returnCell;
                                  return (
                                    <td key={item.point} className="border-l px-2 py-1.5">
                                      <input type="number" step="any" value={value} onChange={event => updateOperationPoint(item.point, { [row.key]: event.target.value })} disabled={!canEditOperationEvents || loading || saving} className="h-8 w-full rounded border border-[#173b64] px-2 text-center font-mono text-sm font-bold focus:border-[#173b64] focus:outline-none disabled:bg-slate-100" />
                                      <code className="mt-0.5 block text-center text-[9px] text-slate-400">{cell}</code>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="grid gap-2 border-t border-orange-100 bg-orange-50/50 p-3 sm:grid-cols-3">
                        {selectedOperationOil?.phases.map((value, index) => (
                          <div key={index} className="rounded-lg border border-orange-100 bg-white p-2 text-center">
                            <div className="text-[10px] font-semibold text-slate-500">{selectedOperationEvent.kind === "startup" ? index === 0 ? "Từ khởi động đến hòa lưới" : "Từ hòa lưới đến cắt dầu" : "Lượng dầu của sự kiện"}</div>
                            <div className="mt-1 text-sm font-black text-orange-900">{format(value)} tấn</div>
                          </div>
                        ))}
                        <div className="rounded-lg border border-orange-200 bg-white p-2 text-center">
                          <div className="text-[10px] font-bold text-orange-900">Tổng dầu sự kiện</div>
                          <div className="mt-1 text-sm font-black text-orange-950">{format(selectedOperationOil?.total)} tấn</div>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 6: BÁO CÁO PMIS 02-PĐ & ĐỐI CHIẾU NGÀY (SẢN LƯỢNG & CHỈ TIÊU KTKT)     */}
          {/* ========================================================================= */}
          {activeTab === "pmis_reports" && (() => {
            const j157 = num(current, "J157");
            const k157 = num(current, "K157");
            const l157 = j157 !== null && k157 !== null ? j157 - k157 : null;

            const j158 = num(current, "J158");
            const k158 = num(current, "K158");
            const l158 = j158 !== null && k158 !== null ? j158 - k158 : null;

            const jSum = (j157 ?? 0) + (j158 ?? 0);
            const kSum = (k157 ?? 0) + (k158 ?? 0);
            const lSum = (l157 ?? 0) + (l158 ?? 0);

            const canEditPmis = canEditSelectedDate && canEditCtktktGroup(user, "pmis_reports");

            return (
              <div className="space-y-6">
                {/* Thanh công cụ và điều khiển đồng bộ QLKT */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-[#173b64]">
                        Báo cáo PMIS 02-PĐ &amp; Đối chiếu ngày (Sản lượng &amp; Chỉ tiêu KTKT)
                      </h3>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${extensionOutdated ? "bg-amber-50 text-amber-700" : extensionVersion ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${extensionOutdated ? "bg-amber-500" : extensionVersion ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {extensionOutdated ? `Tiện ích v${extensionVersion} · web tự tương thích` : extensionVersion ? `Tiện ích v${extensionVersion}` : "Chưa kết nối tiện ích"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Chỉ lấy tự động từ QLKT (mục Sản lượng DH1_MF1/MF2 và mục 02-PĐ hàng Duyên Hải 1), không dùng công tơ và không nhập tay. Các số liệu này tự động liên kết sang Cụm 1 và Mục 2 của BCSX S1, S2, A0.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={syncingPmis || !canEditPmis}
                      onClick={syncPmis02PdFromQlkt}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-3.5 py-2 text-xs font-bold text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`size-3.5 ${syncingPmis ? "animate-spin" : ""}`} />
                      {syncingPmis ? "Đang đồng bộ PMIS…" : "Đồng bộ PMIS & 02-PĐ"}
                    </button>
                    <button
                      type="button"
                      disabled={saving || !userCanEditAny}
                      onClick={() => void save()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="size-3.5" />
                      {saving ? "Đang lưu…" : "Lưu số liệu"}
                    </button>
                  </div>
                </div>

                {/* BẢNG 1: PMIS => Sản xuất điện => Vận hành => Sản lượng (Dòng 155 - 158) */}
                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                  <div className="border-b border-slate-300 bg-white px-4 py-2.5 text-center">
                    <div className="text-sm font-extrabold text-red-600">
                      PMIS =&gt; Sản xuất điện =&gt; Vận hành =&gt; Sản lượng
                    </div>
                    <div className="text-[11px] font-semibold text-red-500 italic">
                      (Nhập số chú ý khoảng trắng và đơn vị)
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="report-data-table w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[#173b64]">
                          <th className="border border-slate-300 px-3 py-2 text-center font-bold w-24">
                            Tổ máy
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-center font-bold">
                            Điện đầu cực PMIS<br />
                            <span className="font-normal text-slate-500">(MW)</span>
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-center font-bold">
                            Điện năng xuất tuyến PMIS<br />
                            <span className="font-normal text-slate-500">(MW)</span>
                          </th>
                          <th className="border border-slate-300 px-3 py-2 text-center font-bold">
                            Tổng tự dùng PMIS<br />
                            <span className="font-normal text-slate-500">(MW)</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Tổ máy S1 */}
                        <tr className="bg-[#008000] text-white">
                          <td className="border border-slate-400 px-3 py-2 text-center font-normal text-white bg-[#006e00] text-xs">
                            S1
                          </td>
                          <td className="border border-slate-400 p-1">
                            {renderCellInput("J157", {
                              group: "pmis_reports",
                              className: "!bg-[#008000] !text-red-300 font-bold text-sm text-center focus:!bg-[#005a00] focus:!text-white",
                              placeholder: "10472.680",
                            })}
                          </td>
                          <td className="border border-slate-400 p-1">
                            {renderCellInput("K157", {
                              group: "pmis_reports",
                              className: "!bg-[#008000] !text-red-300 font-bold text-sm text-center focus:!bg-[#005a00] focus:!text-white",
                              placeholder: "9631.526",
                            })}
                          </td>
                          <td className="border border-slate-400 px-3 py-2 text-center font-mono font-normal text-red-300 text-xs text-xs">
                            {l157 !== null ? format(l157) : "—"}
                          </td>
                        </tr>

                        {/* Tổ máy S2 */}
                        <tr className="bg-[#008000] text-white">
                          <td className="border border-slate-400 px-3 py-2 text-center font-normal text-white bg-[#006e00] text-xs">
                            S2
                          </td>
                          <td className="border border-slate-400 p-1">
                            {renderCellInput("J158", {
                              group: "pmis_reports",
                              className: "!bg-[#008000] !text-red-300 font-bold text-sm text-center focus:!bg-[#005a00] focus:!text-white",
                              placeholder: "10474.000",
                            })}
                          </td>
                          <td className="border border-slate-400 p-1">
                            {renderCellInput("K158", {
                              group: "pmis_reports",
                              className: "!bg-[#008000] !text-red-300 font-bold text-sm text-center focus:!bg-[#005a00] focus:!text-white",
                              placeholder: "9593.341",
                            })}
                          </td>
                          <td className="border border-slate-400 px-3 py-2 text-center font-mono font-normal text-red-300 text-xs text-xs">
                            {l158 !== null ? format(l158) : "—"}
                          </td>
                        </tr>

                        {/* Toàn nhà máy */}
                        <tr className="bg-slate-100 font-bold text-[#173b64]">
                          <td className="border border-slate-300 px-3 py-2 text-center font-extrabold text-xs">
                            Toàn NM
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center font-mono text-xs text-xs">
                            {(j157 !== null || j158 !== null) ? format(jSum) : "—"}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center font-mono text-xs text-xs">
                            {(k157 !== null || k158 !== null) ? format(kSum) : "—"}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center font-mono text-xs text-xs">
                            {(l157 !== null || l158 !== null) ? format(lSum) : "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      💡 <b>Liên kết trực tiếp:</b> Số liệu Điện đầu cực (J157, J158) và Xuất tuyến (K157, K158) ở đây tự động làm nguồn cho <b>Cụm 1 · Thống kê chỉ tiêu KTKT</b> và <b>Mục 2 của Báo cáo sản xuất (BCSX)</b> cho cả 3 file S1, S2, A0.
                    </span>
                    <span className="text-slate-500">Công thức: Tự dùng PMIS = Đầu cực − Xuất tuyến</span>
                  </div>
                </div>

                {/* BẢNG 2: PMIS => Sản xuất điện => Báo cáo => Báo cáo chỉ tiêu kinh tế kỹ thuật số 02 - PĐ (Dòng 178 - 181) */}
                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                  <div className="border-b border-slate-300 bg-white px-4 py-2.5 text-center">
                    <div className="text-sm font-extrabold text-[#173b64]">
                      PMIS =&gt; Sản xuất điện =&gt; Báo cáo =&gt; Báo cáo chỉ tiêu kinh tế kỹ thuật số 02 - PĐ
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      Đồng bộ trực tiếp từ hàng <b>&quot;Duyên Hải 1&quot;</b> trên màn hình QLKT 02-PĐ (rpt_CT_QLKT_02_PD_New.jsf)
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="report-data-table w-full border-collapse text-xs whitespace-nowrap">
                      <thead>
                        {/* Hàng tiêu đề cấp 1 */}
                        <tr className="bg-slate-100 text-[#173b64] font-bold text-center">
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={1}>Công suất NMĐ</th>
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={2}>Điện năng đầu cực MF</th>
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={3}>Điện năng giao nhận</th>
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={2}>Tổn thất MBA</th>
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={2}>Điện tự dùng</th>
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={1}>Lượng nhiên liệu sử dụng</th>
                          <th className="border border-slate-300 px-2 py-1.5" colSpan={4}>Suất hao nhiên liệu</th>
                          <th className="border border-slate-300 px-2 py-1.5" rowSpan={2}>Hệ số sử dụng</th>
                          <th className="border border-slate-300 px-2 py-1.5" rowSpan={2}>Hệ số đáp ứng</th>
                          <th className="border border-slate-300 px-2 py-1.5" rowSpan={2}>Độ phát thải</th>
                        </tr>
                        {/* Hàng tiêu đề cấp 2 */}
                        <tr className="bg-slate-50 text-slate-700 font-bold text-center text-[11px]">
                          <th className="border border-slate-300 px-2 py-1">Công suất đặt</th>
                          <th className="border border-slate-300 px-2 py-1">Điện năng tác dụng</th>
                          <th className="border border-slate-300 px-2 py-1">Điện năng phản kháng</th>
                          <th className="border border-slate-300 px-2 py-1">Điện năng giao</th>
                          <th className="border border-slate-300 px-2 py-1">Điện năng nhận</th>
                          <th className="border border-slate-300 px-2 py-1">Điện năng nhận chạy bù</th>
                          <th className="border border-slate-300 px-2 py-1">MBA kích từ</th>
                          <th className="border border-slate-300 px-2 py-1">MBA nâng</th>
                          <th className="border border-slate-300 px-2 py-1">Điện năng tự dùng</th>
                          <th className="border border-slate-300 px-2 py-1">k tự dùng</th>
                          <th className="border border-slate-300 px-2 py-1">Nhiên liệu sử dụng</th>
                          <th className="border border-slate-300 px-2 py-1">Suất hao nhiên liệu thô</th>
                          <th className="border border-slate-300 px-2 py-1">Suất hao nhiên liệu tinh</th>
                          <th className="border border-slate-300 px-2 py-1">Suất hao nhiệt thô</th>
                          <th className="border border-slate-300 px-2 py-1">Suất hao nhiệt tinh</th>
                        </tr>
                        {/* Hàng đơn vị */}
                        <tr className="bg-slate-50/70 text-slate-500 text-[10px] text-center italic">
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(MW)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kVArh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Tr. kWh)</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">%</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">Tr. Tấn / Tr. BTU</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">g/kWh</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">g/kWh</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">kJ/kWh</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">kJ/kWh</th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal"> </th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal"> </th>
                          <th className="border border-slate-300 px-2 py-0.5 font-normal">(Đạt / Ko đạt)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Dòng 181 nhập liệu */}
                        <tr className="bg-[#008000] text-white">
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("C181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "1245" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("D181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "20.9467" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("E181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("F181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "19.2249" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("G181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("H181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("I181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("J181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("K181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "1.7218" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("L181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "8.22" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("M181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0.0102" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("N181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "489.2526" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("O181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "533.0709" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("P181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "9710.6908" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-28">
                            {renderCellInput("Q181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "10580.3974" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("R181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0.701" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("S181", { group: "pmis_reports", className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "0" })}
                          </td>
                          <td className="border border-slate-400 p-1 w-24">
                            {renderCellInput("T181", { group: "pmis_reports", isNumber: false, className: "!bg-[#008000] !text-red-300 font-bold text-xs text-center focus:!bg-[#005a00] focus:!text-white", placeholder: "Đạt" })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      📋 <b>Mẹo thao tác:</b> Có thể dùng phím mũi tên <b>← ↑ → ↓</b> hoặc <b>Enter/Tab</b> để di chuyển giữa các ô, hoặc copy toàn bộ hàng số liệu từ Excel / QLKT rồi bấm <b>Ctrl+V</b> vào ô đầu tiên để dán hàng loạt.
                    </span>
                    <span className="font-semibold text-slate-500">Dòng 181 (C181:T181)</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* TAB 7: TRA CỨU TOÀN BỘ Ô (LƯỚI / TÌM KIẾM CHO KỸ THUẬT VIÊN)              */}
          {/* ========================================================================= */}
          {activeTab === "all_fields" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
                <div className="flex items-center gap-2">
                  <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-600 focus-within:border-indigo-500 focus-within:bg-white">
                    <Search className="size-3.5 text-slate-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Tìm mã ô (W8, M9...) hoặc tên..."
                      className="w-56 bg-transparent outline-none"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        ✕
                      </button>
                    )}
                  </label>
                  <span className="text-xs text-slate-500">
                    Hiển thị {editableFields.length} ô nhập tay
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 max-h-[600px] overflow-y-auto p-1">
                {editableFields
                  .filter(f => {
                    if (!search.trim()) return true;
                    const q = search.trim().toLowerCase();
                    return (
                      f.cell.toLowerCase().includes(q) ||
                      (f.label && f.label.toLowerCase().includes(q))
                    );
                  })
                  .map(f => {
                    const canEditThis = canEditSelectedDate && canEditCtktktField(user, f.cell);
                    return (
                      <div
                        key={f.cell}
                        className={`flex items-center justify-between gap-2 rounded-lg border p-1.5 text-xs ${
                          canEditThis
                            ? "border-slate-200 bg-white hover:border-indigo-300"
                            : "border-slate-200 bg-slate-100/70"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <code className="font-mono text-[10px] font-bold text-slate-700">
                              {f.cell}
                            </code>
                            {!canEditThis && <Lock className="size-2.5 text-slate-400" />}
                          </div>
                          <span
                            className="text-[10px] text-slate-600 truncate block leading-tight"
                            title={f.label}
                          >
                            {f.label}
                          </span>
                        </div>
                        <div className="w-20 shrink-0">
                          {renderCellInput(f.cell, {
                            compact: true,
                            readOnlyValue: isFirstDayOfMonth
                              ? undefined
                              : f.cell === COAL_STOCK_24H_START_CELL
                                ? coalStock.stock === null ? "" : format(coalStock.stock)
                                : f.cell === "W86"
                                  ? pmisCoalStock.stock === null ? "" : format(pmisCoalStock.stock)
                                  : undefined,
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Footer ghi chú tổng kết */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-[#fffbeb] px-4 py-2 text-[11px] text-amber-900">
          <span>
            <b>Lưu ý nghiệp vụ:</b> Các cụm phụ (Lò hơi phụ, Nước sử dụng, Mực bồn HFO, Suất hao
            nhiệt) đã được lược bớt trên giao diện web theo quy trình vận hành và giữ đầy đủ trong
            file xuất Excel.
          </span>
          <span className="font-semibold text-amber-800">
            {editableFields.length} ô nhập tay · 42 ô liên kết BCSX
          </span>
        </div>
      </div>

      {showEmailModal && (
        <CtktktEmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          operatingDate={date}
          currentEntries={current}
          previousEntries={previous}
          initialShiftName="Tổ C"
        />
      )}

      {coalPhotoMounted&&<CoalMeterPhotoImport
        open={coalPhotoOpen}
        onOpenChange={setCoalPhotoOpen}
        reportDate={date}
        current={current}
        previous={previous}
        canEditCell={canEditCoalCell}
        initialUnit={unitView==="s2"?"S2":"S1"}
        disabled={loading||saving||syncingPmis}
        maxDate={vietnamDateIso()}
        onDateChange={value=>{
          if(dirtyCellsRef.current.size>0||saving||syncingPmis)return "Hãy lưu số liệu ngày đang nhập trước khi chuyển ngày.";
          if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>vietnamDateIso())return "Ngày ghi chỉ số không hợp lệ hoặc ở tương lai.";
          if(!canEditOperatingDate(value,isAdminUser(user)))return "Bạn chỉ được nhập ngày hôm nay hoặc hôm qua; ngày cũ cần quản trị viên.";
          setLoading(true);
          setDate(value);setError("");setMessage("");
        }}
        onSave={async (values,unit)=>{
          if(loading||saving||!canEditSelectedDate)throw new Error("Ngày này chưa sẵn sàng hoặc bạn không có quyền lưu.");
          setSaving(true);
          try{
            const verified=await saveReviewedCoalEntries(ctktktRequest,date,values,unit);
            setByDate(old=>({...old,[date]:{...(old[date]||{}),...Object.fromEntries(verified.map(entry=>[entry.cell,entry.value]))}}));
            for(const entry of verified)dirtyCellsRef.current.delete(entry.cell);
            setDirty(dirtyCellsRef.current.size>0);
            setMessage(`Đã lưu và kiểm tra lại ${verified.length} chỉ số công tơ than ngày ${date.split("-").reverse().join("/")}.`);
          }finally{setSaving(false);}
        }}
        onApply={values => {
          for (const { cell, value } of values) update(cell, value);
          setMessage(`Đã điền ${values.length} chỉ số công tơ than từ ảnh. Kiểm tra bảng rồi bấm “Lưu số liệu”.`);
        }}
      />}
    </section>
  );
}
