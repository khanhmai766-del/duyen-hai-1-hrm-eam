"use client";
// State và logic của trang Chỉ tiêu KTKT (chép nguyên văn từ thân CtktktReport khi tách tệp 09/11/2026).
import { CTKTKT_ELECTRIC_METER_RESET_CELLS } from "../../lib/ctktkt-electric-meter-reset";
import { CTKTKT_PMIS_AUX_CELLS } from "../../lib/ctktkt-pmis-auxiliary";
import { downloadCtktktFile, fetchStoredCtktktReport, useReadCtktktReport, useSaveCtktktReport } from "@/hooks/useKtktReport";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { calculateCoalStock24h, calculatePmisCoalStockOpening, COAL_STOCK_24H_START_CELL } from "@/modules/ctktkt/lib/coal-stock";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { acknowledgeReportDraft, mergeReportDraft, pruneReportDrafts, readReportDraft, reportDraftKey, writeReportDraft } from "@/modules/ctktkt/lib/report-draft";
import { canEditOperatingDate, defaultOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { canEditAnyCtktktField, canEditCtktktField, canEditCtktktGroup, getEditableCtktktGroups, getCtktktFieldGroup, CTKTKT_GROUP_META, type CtktktFieldGroup } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { CTKTKT_BCSX_LINKED_CELLS } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { CTKTKT_WATER_LINKED_CELLS } from "@/modules/ctktkt/lib/ctktkt-water-link";
import { calculateCtktktSummary, calculateCtktktMeterSummary, calculateTkdDcsSummary, calculateOilDifferences, calculateSteamDifferences, calculateNh3Summary, calculateNh3DcsSummary, calculateCoalShiftDetails, applyNh3StartLevelCarryover, NH3_DCS_START_METER_CELLS, NH3_START_LEVEL_CELLS, NH3_OPENING_STOCK_CELL, previousIsoDate, type CtktktDayEntries } from "@/modules/ctktkt/lib/ctktkt-report";
import { normalizeCtktktInputValue } from "@/modules/ctktkt/lib/ctktkt-extra-fields";
import { parseSpreadsheetClipboard } from "@/modules/ctktkt/lib/spreadsheet-grid";
import { CTKTKT_INSTALLED_CAPACITY_CELL, CTKTKT_INSTALLED_CAPACITY_MW } from "@/modules/ctktkt/lib/ctktkt-defaults";
import { isQlktExtensionOutdated } from "@/modules/ctktkt/lib/qlkt-extension-version";
import { PMIS_PRODUCTION_CELLS, sanitizeCtktktPmisSyncEntries } from "@/modules/ctktkt/lib/ctktkt-pmis-sync";
import { calculateCtktktOperationEventOil, createCtktktOperationEvent, CTKTKT_OPERATION_EVENTS_CELL, ctktktOperationEventId, parseCtktktOperationEvents, type CtktktOperationEvent, type CtktktOperationKind, type CtktktOperationPoint, type CtktktOperationUnit } from "@/modules/ctktkt/lib/ctktkt-operation-events";
import { isMissingValue, describeCtktktMissingField } from "@/modules/ctktkt/lib/data-completeness";
import { shouldShowCtktktMissingField } from "@/modules/ctktkt/lib/ctktkt-missing-fields";
import type { MissingDataItem } from "@/modules/ctktkt/components/missing-data-alert";
import { LoadedEntry, LinkWarning, MainTab, QLKT_PRODUCTION_CELLS, editableFields } from "./shared";

export function useCtktktReport() {
  // Bảng nhập tự giữ số đang sửa (bản nháp): đọc kiểu mệnh lệnh qua TanStack, lưu qua mutation (làm cũ ["ctktkt"]).
  const readReport = useReadCtktktReport();
  const { mutateAsync: saveReport } = useSaveCtktktReport();
  const downloadReport = downloadCtktktFile;

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
  const [coalReviewUnit,setCoalReviewUnit]=useState<"S1"|"S2"|null>(null);
  const [coalPhotoMounted,setCoalPhotoMounted]=useState(false);
  const setCoalPhotoOpen=(open:boolean)=>{if(open)setCoalPhotoMounted(true);setCoalPhotoOpenState(open);};
  const canEditCoalCell = useCallback((cell: string) => canEditSelectedDate && canEditCtktktField(user, cell), [user, canEditSelectedDate]);
  const [extensionVersion, setExtensionVersion] = useState("");
  const extensionOutdated = isQlktExtensionOutdated(extensionVersion);
  const [syncingPmis, setSyncingPmis] = useState(false);
  const pmisRequestRef = useRef<{ id: string; timer: number; operatingDate: string } | null>(null);
  const dirtyCellsRef = useRef(new Set<string>());
  const draftRef = useRef<{ key: string; values: CtktktDayEntries }>({ key: "", values: {} });
  const saveInFlightRef = useRef(false);
  const [draftWarning, setDraftWarning] = useState("");
  const draftKey = reportDraftKey(user.id, date);

  const persistDraft = useCallback(() => {
    try {
      writeReportDraft(window.localStorage, draftRef.current.key, draftRef.current.values);
      setDraftWarning("");
    } catch {
      setDraftWarning("Trình duyệt chưa giữ được bản nháp. Hãy bấm Lưu số liệu và chờ xác nhận trước khi tải lại hoặc đóng trang.");
    }
  }, []);

  const stageValues = useCallback((values: CtktktDayEntries, operatingDate = date) => {
    if (draftRef.current.key !== reportDraftKey(user.id, operatingDate)) return;
    draftRef.current.values = mergeReportDraft(draftRef.current.values, values);
    for (const cell of Object.keys(values)) dirtyCellsRef.current.add(cell);
    persistDraft();
    setDirty(true);
    setByDate(old => ({ ...old, [operatingDate]: mergeReportDraft(old[operatingDate] || {}, values) }));
  }, [date, user.id, persistDraft]);

  const acknowledgeSaved = useCallback((entries: Array<{ cell: string; value: string }>, operatingDate = date) => {
    if (draftRef.current.key !== reportDraftKey(user.id, operatingDate)) return;
    draftRef.current.values = acknowledgeReportDraft(draftRef.current.values, entries);
    dirtyCellsRef.current = new Set(Object.keys(draftRef.current.values));
    persistDraft();
    setDirty(dirtyCellsRef.current.size > 0);
  }, [date, user.id, persistDraft]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (dirtyCellsRef.current.size === 0 && !saveInFlightRef.current && !saving) return;
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
      stageValues(updates, request.operatingDate);
      try {
        await saveReport({ operatingDate: request.operatingDate, entries: safeEntries });
        acknowledgeSaved(safeEntries, request.operatingDate);
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
  }, [saveReport, stageValues, acknowledgeSaved]);

  const period = date.slice(0, 7);

  useEffect(() => {
    const controller = new AbortController();
    const load=async(query:string)=>{
        const body = await readReport<LinkWarning>(query);
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
        if (draftRef.current.key !== draftKey) {
          draftRef.current = { key: draftKey, values: {} };
          try {
            // Dọn bản nháp cũ của chính tài khoản này để trình duyệt không tích tụ dữ liệu.
            try { pruneReportDrafts(window.localStorage, user.id, vietnamDateIso()); } catch { /* không chặn việc mở báo cáo */ }
            const restored = readReportDraft(window.localStorage, draftKey);
            // Keep the account's draft even when its date now needs admin approval.
            draftRef.current.values = Object.fromEntries(Object.entries(restored).filter(([cell]) => editableFields.some(field => field.cell === cell)));
            setDraftWarning("");
          } catch {
            setDraftWarning("Không đọc được bản nháp trên trình duyệt. Hãy kiểm tra số liệu trước khi tiếp tục nhập.");
          }
          dirtyCellsRef.current = new Set(Object.keys(draftRef.current.values));
          setDirty(dirtyCellsRef.current.size > 0);
          if (dirtyCellsRef.current.size > 0) setMessage("Đã khôi phục bản nháp chưa lưu của ngày này trên máy. Kiểm tra và bấm Lưu số liệu; bản nháp chưa phải dữ liệu đã lưu trên web.");
        }
        // Start all independent reads together, while applying results in the safe legacy order.
        const previous = previousIsoDate(date);
        const dayRequest = load(new URLSearchParams({period, date, scope:"daily-links"}).toString());
        const contextRequest = previous > `${period}-01` ? load(new URLSearchParams({period, from:`${period}-01`, to:previous, scope:"daily-links"}).toString()) : null;
        const hoursRequest = load(new URLSearchParams({period, date, scope:"operating-hours"}).toString());
        contextRequest?.catch(()=>{}); hoursRequest.catch(()=>{});
        const day = await dayRequest;
        const stored = group(day.entries);
        const alreadyStored = Object.entries(draftRef.current.values)
          .filter(([cell, value]) => normalizeCtktktInputValue(cell, stored[date]?.[cell] ?? "") === normalizeCtktktInputValue(cell, value))
          .map(([cell, value]) => ({cell, value}));
        if (alreadyStored.length) acknowledgeSaved(alreadyStored);
        stored[date] = mergeReportDraft(stored[date] || {}, draftRef.current.values);
        setByDate(stored); setLinkedByDate(group(day.linkedEntries)); setLinkWarnings(day.warnings || []);
        setLoading(false);
        if(contextRequest){
          const context=await contextRequest;
          // Do not replace today's inputs or yesterday's readings with a late response.
          const earlier=(entries:LoadedEntry[]=[])=>entries.filter(entry=>entry.operatingDate<previous);
          setByDate(old=>({...group(earlier(context.entries)),...old}));
          setLinkedByDate(old=>({...group(earlier(context.linkedEntries)),...old}));
        }
        const hours=await hoursRequest;
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
  }, [period,date,draftKey,reloadVersion, readReport, acknowledgeSaved, user.id]);

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
      ...CTKTKT_ELECTRIC_METER_RESET_CELLS,
      ...CTKTKT_PMIS_AUX_CELLS,
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
    stageValues({ [cell]: value });
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
    if (!userCanEditAny || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const dirtyCells = [...dirtyCellsRef.current];
      const toSend = dirtyCells
        .filter(cell => canEditCtktktField(user, cell))
        .map(cell => ({ cell, value: draftRef.current.values[cell] ?? current[cell] ?? "" }));
      if (!toSend.length) throw new Error("Không có ô dữ liệu nào vừa thay đổi để lưu.");

      const body = await saveReport({ operatingDate: date, entries: toSend });

      // Đọc lại ngay từ CSDL để không báo thành công giả. Lỗi từng gặp ở cụm
      // NH3 là giao diện vẫn giữ số vừa nhập nhưng tải lại trang thì mất.
      const verifiedEntries = await fetchStoredCtktktReport(period, date).catch(reason => {
        throw reason instanceof Error && reason.message ? reason : new Error("Đã gửi dữ liệu nhưng chưa kiểm tra lại được CSDL.");
      });
      const persisted = Object.fromEntries(
        (verifiedEntries || [])
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
      acknowledgeSaved(toSend);
      setByDate(old => ({ ...old, [date]: mergeReportDraft(persisted, draftRef.current.values) }));
      setMessage(
        `Đã lưu thành công ${body.saved || 0} ô dữ liệu ngày ${date.split("-").reverse().join("/")}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được dữ liệu.");
    } finally {
      saveInFlightRef.current = false;
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
    // Excel/Google Sheets chỉ đưa số đang hiển thị vào text/plain; HTML giữ giá trị gốc
    // (vd. độ ẩm 8,2567 hiển thị 8,3) để số dán lên web đúng bằng số trong bảng tính.
    const html = e.clipboardData.getData("text/html");

    // Chỉ can thiệp nếu clipboard chứa tab hoặc xuống dòng (dữ liệu nhiều ô)
    if (!text.includes("\t") && !text.includes("\n") && !text.includes("\r")) {
      const preciseValue = html ? parseSpreadsheetClipboard(text, html)[0]?.[0] : undefined;
      if (preciseValue !== undefined && preciseValue !== parseSpreadsheetClipboard(text)[0]?.[0]) {
        e.preventDefault();
        update(startCell, preciseValue);
      }
      return;
    }

    e.preventDefault();

    const rows = parseSpreadsheetClipboard(text, html);
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
      stageValues(updates);
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
    if (isAdminUser(user)) {
      return "Toàn quyền quản lý, nhập liệu và phê duyệt số liệu";
    }
    if (user.permissions.includes("edit_ctktkt")) {
      return "Nhập toàn bộ nhóm · Ca đêm chốt ngày D.";
    }

    if (editableGroups.length === 0) {
      if (user.permissions.includes("ctktkt_other_fields")) return "Quyền nhập: Các ô bổ sung ngoài nhóm";
      return "Chế độ chỉ xem (Không có quyền nhập cho cương vị này)";
    }

    return `Quyền nhập: ${editableGroups.map(g => CTKTKT_GROUP_META[g]?.shortLabel).join(", ")}`;
  }, [user, editableGroups]);

  return {
    saveReport,
    user,
    date,
    setDate,
    canEditSelectedDate,
    userCanEditAny,
    setByDate,
    linkedByDate,
    activeTab,
    setActiveTab,
    unitView,
    setUnitView,
    operationUnit,
    setOperationUnit,
    operationKind,
    setOperationKind,
    search,
    setSearch,
    loading,
    setLoading,
    extrasState,
    setReloadVersion,
    saving,
    setSaving,
    dirty,
    setDirty,
    message,
    setMessage,
    error,
    setError,
    isKpiCollapsed,
    setIsKpiCollapsed,
    showEmailModal,
    setShowEmailModal,
    exportMissingOpen,
    setExportMissingOpen,
    exportMissingItems,
    setPendingReportOutput,
    coalPhotoOpen,
    coalReviewUnit,
    setCoalReviewUnit,
    coalPhotoMounted,
    setCoalPhotoOpen,
    canEditCoalCell,
    extensionVersion,
    extensionOutdated,
    syncingPmis,
    dirtyCellsRef,
    draftWarning,
    stageValues,
    acknowledgeSaved,
    previousDate,
    previous,
    current,
    isFirstDayOfMonth,
    coalStock,
    pmisCoalStock,
    hoursMissingUpToDate,
    operationEvents,
    selectedOperationEvent,
    selectedOperationOil,
    canEditOperationEvents,
    selectedWarnings,
    hasPreviousManualData,
    beginCtktktOutput,
    continueCtktktOutput,
    returnToCtktktMissingInput,
    summary,
    meterSummary,
    coalShiftDetails,
    tkdCalc,
    oilS1,
    oilS2,
    steamS1,
    steamS2,
    nh3,
    nh3Dcs,
    update,
    addOperationEvent,
    deleteOperationEvent,
    updateOperationPoint,
    save,
    syncPmis02PdFromQlkt,
    renderCellInput,
    userRoleDescription,
  };
}

/** Mọi giá trị trang dùng chung cho các phần giao diện (tab, khối KPI). */
export type CtktktReportCtx = ReturnType<typeof useCtktktReport>;
