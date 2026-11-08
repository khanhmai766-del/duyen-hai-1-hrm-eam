"use client";
import { fetchPpaWithSource, usePatchPpaRange, usePpaRange, useSavePpaNotes } from "@/hooks/useKtktPpa";

import { Fragment, useEffect, useMemo, useState } from "react";
import { PpaUnitCard } from "@/modules/ctktkt/components/ppa-unit-card";
import { PpaNotePreview } from "@/modules/ctktkt/components/ppa-note-preview";
import "./ppa-detail-table.css";
import "./ppa-controls.css";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import { ArrowRight, CalendarRange, ChevronDown, Download, Sheet } from "lucide-react";
import { GoogleSheetSyncButton } from "@/modules/ctktkt/components/google-sheet-sync-button";
import { calculateActualHeatRate, calculatePpaHeatRateDetailed, compareHeatRate, type PpaSourceData, type UnitDetail } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { loadSheetJs } from "@/modules/ctktkt/lib/sheetjs-loader";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { hasPermission } from "@/modules/ctktkt/lib/auth/session";
import { PPA_AVAILABLE_CAPACITY_S1_CODE, PPA_AVAILABLE_CAPACITY_S2_CODE } from "@/modules/ctktkt/lib/google-sheet-sync";
import { addDaysIso, defaultOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import {reportPage} from "@/modules/ctktkt/lib/report-loading";
import {ReportTablePager} from "@/modules/ctktkt/components/report-table-pager";
import {buildUnitSheet,buildMeterSheet,buildPlantSheet} from "@/modules/ctktkt/lib/ppa-sheet-export";
import { ExportMissingDialog } from "@/modules/ctktkt/components/export-missing-dialog";
import type { MissingDataItem } from "@/modules/ctktkt/components/missing-data-alert";

type DailyInput = { operatingDate: string; fieldCode: string; value: string };
type StoredPpa = {
  operatingDate: string;
  ppaPlant: string | number;
  ppaS1: string | number;
  ppaS2: string | number;
  grossS1Kwh?: string | number;
  netS1Kwh?: string | number;
  grossS2Kwh?: string | number;
  netS2Kwh?: string | number;
  noteS1: string;
  noteS2: string;
};
// entries?includeSource=1 trả thêm "source" (4 dãy 48 chu kỳ gốc) đã lưu khi nhập ngày đó —
// dùng để tái tạo các sheet S1/S2/từng ngày giống file mẫu khi xuất Excel.
type StoredPpaWithSource = StoredPpa & { source?: PpaSourceData | null };

type UnitKey = "plant" | "s1" | "s2";

type Row = {
  date: string;
  ppaPlant: number | null; actualPlant: number | null;
  ppaS1: number | null; actualS1: number | null;
  ppaS2: number | null; actualS2: number | null;
  netS1Kwh: number | null; netS2Kwh: number | null;
  availableCapacityS1Mw: number | null; availableCapacityS2Mw: number | null;
  noteS1: string; noteS2: string;
};


const numberFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const format = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? "—" : numberFormat.format(value);
const formatPercent = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? "—" : `${percentFormat.format(value)}%`;
const shortDate = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const fullDate = (iso: string) => iso.split("-").reverse().join("/");
const ddMM = (iso: string) => `${iso.slice(8,10)}${iso.slice(5,7)}`;
const monthLabel = (period: string) => `Tháng ${period.slice(5, 7)}/${period.slice(0, 4)}`;

function periodsBetween(from: string, to: string) {
  const periods: string[] = [];
  let [year, month] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const endYear = Number(to.slice(0, 4)), endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1; if (month > 12) { month = 1; year += 1; }
    if (periods.length > 36) break;
  }
  return periods;
}

export function PpaHeatRateDashboard({ tabs }: { tabs?: React.ReactNode }) {
  const user = useSessionUser();
  const canEdit = hasPermission(user, "edit_ppa");
  const today = useMemo(() => vietnamDateIso(), []);
  const defaultDate = useMemo(() => defaultOperatingDate(), []);
  const [fromDate, setFromDate] = useState(() => `${defaultOperatingDate().slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(defaultDate);
  const [rangeLabel, setRangeLabel] = useState("Tháng vận hành");
  const [tablePage,setTablePage]=useState(0);
  const [actionError, setError] = useState("");
  const [sheetDate, setSheetDate] = useState(defaultDate);
  // Khoảng đã yêu cầu tải (Áp dụng / chọn nhanh). clamp: chế độ "Tất cả" — co khoảng xem về phạm vi có dữ liệu.
  const [request, setRequest] = useState(() => ({ from: fromDate, to: toDate, clamp: false }));
  const rangeQuery = usePpaRange(request.from, request.to);
  const loading = rangeQuery.isFetching;
  const error = actionError || (rangeQuery.error instanceof Error ? rangeQuery.error.message : "");
  // Khoảng đang lọc để hiển thị — chốt lúc dữ liệu của lượt tải về (như bản cũ lọc ngay khi tải xong).
  const [view, setView] = useState<{ from: string; to: string } | null>(null);
  const [handledData, setHandledData] = useState<unknown>(null);
  const loaded = rangeQuery.isPlaceholderData ? undefined : rangeQuery.data;
  if (loaded && loaded !== handledData) {
    setHandledData(loaded);
    let from = request.from, to = request.to;
    if (request.clamp && loaded.ppa.length) {
      const dates = loaded.ppa.map(entry => entry.operatingDate).sort();
      from = dates[0]; to = dates[dates.length - 1];
      setFromDate(from); setToDate(to);
    }
    const filtered = loaded.ppa.filter(entry => entry.operatingDate >= from && entry.operatingDate <= to);
    if (filtered.length) {
      const latestSavedDate = [...filtered].sort((a, b) => b.operatingDate.localeCompare(a.operatingDate))[0].operatingDate;
      if (!filtered.some(entry => entry.operatingDate === sheetDate)) setSheetDate(latestSavedDate);
    }
    setView({ from, to });
  }
  const shown = view ? rangeQuery.data : undefined;
  const entries: StoredPpa[] = useMemo(() => view && shown ? shown.ppa.filter(entry => entry.operatingDate >= view.from && entry.operatingDate <= view.to) : [], [shown, view]);
  const dailyInputs: DailyInput[] = useMemo(() => view && shown ? shown.daily.filter(entry => entry.operatingDate >= view.from && entry.operatingDate <= view.to) : [], [shown, view]);
  const restoredCount = view ? entries.length : null;
  const saveNotesMutation = useSavePpaNotes({ invalidate: false });
  const patchRange = usePatchPpaRange();
  const [notesOpen, setNotesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMissingOpen, setExportMissingOpen] = useState(false);
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    date: string;
    noteS1: string;
    noteS2: string;
    availableCapacityS1Mw: string;
    availableCapacityS2Mw: string;
    saving: boolean;
    error: string;
  }>({
    isOpen: false,
    date: "",
    noteS1: "",
    noteS2: "",
    availableCapacityS1Mw: "",
    availableCapacityS2Mw: "",
    saving: false,
    error: "",
  });

  function openEditNote(row: Row) {
    setEditModal({
      isOpen: true,
      date: row.date,
      noteS1: row.noteS1 || "",
      noteS2: row.noteS2 || "",
      availableCapacityS1Mw: row.availableCapacityS1Mw === null ? "" : String(row.availableCapacityS1Mw),
      availableCapacityS2Mw: row.availableCapacityS2Mw === null ? "" : String(row.availableCapacityS2Mw),
      saving: false,
      error: "",
    });
  }

  async function handleSaveNote() {
    if (!editModal.date) return;
    setEditModal(prev => ({ ...prev, saving: true, error: "" }));
    try {
      await saveNotesMutation.mutateAsync([{
        operatingDate: editModal.date,
        noteS1: editModal.noteS1.trim(),
        noteS2: editModal.noteS2.trim(),
        availableCapacityS1Mw: editModal.availableCapacityS1Mw.trim(),
        availableCapacityS2Mw: editModal.availableCapacityS2Mw.trim(),
      }]);

      // Vá ngay dữ liệu đang xem (không tải lại), đúng như bản cũ vá state.
      patchRange(request.from, request.to, data => ({
        ppa: data.ppa.map(entry => entry.operatingDate === editModal.date ? { ...entry, noteS1: editModal.noteS1.trim(), noteS2: editModal.noteS2.trim() } : entry),
        daily: (() => {
          const next = data.daily.filter(entry => !(entry.operatingDate === editModal.date && (entry.fieldCode === PPA_AVAILABLE_CAPACITY_S1_CODE || entry.fieldCode === PPA_AVAILABLE_CAPACITY_S2_CODE)));
          if (editModal.availableCapacityS1Mw.trim()) next.push({ operatingDate: editModal.date, fieldCode: PPA_AVAILABLE_CAPACITY_S1_CODE, value: editModal.availableCapacityS1Mw.trim().replace(",", ".") });
          if (editModal.availableCapacityS2Mw.trim()) next.push({ operatingDate: editModal.date, fieldCode: PPA_AVAILABLE_CAPACITY_S2_CODE, value: editModal.availableCapacityS2Mw.trim().replace(",", ".") });
          return next;
        })(),
      }));

      setEditModal(prev => ({ ...prev, isOpen: false, saving: false }));
    } catch (caught) {
      setEditModal(prev => ({
        ...prev,
        saving: false,
        error: caught instanceof Error ? caught.message : "Chưa lưu được nhận xét."
      }));
    }
  }

  // Yêu cầu tải một khoảng. Cùng khoảng → tải lại (và xử lý lại kết quả, vd co khoảng ở chế độ "Tất cả").
  function loadRange(from: string, to: string, clampToData: boolean) {
    setTablePage(0); setError("");
    if (from === request.from && to === request.to && clampToData === request.clamp) { setHandledData(null); void rangeQuery.refetch(); }
    else setRequest({ from, to, clamp: clampToData });
  }

  // Cuộn tới dòng còn thiếu sau khi khoảng mới đã tải xong và hiển thị.
  const [scrollToDate, setScrollToDate] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToDate || loading || !view || view.from !== scrollToDate) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`ppa-row-${scrollToDate}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setScrollToDate(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollToDate, loading, view]);

  async function goToPpaMissingRow(item: MissingDataItem) {
    const date = item.key.split(":", 1)[0];
    setExportMissingOpen(false);
    setFromDate(date);
    setToDate(date);
    setRangeLabel("Tuỳ chọn");
    loadRange(date, date, false);
    setScrollToDate(date);
  }


  function applyQuick(kind: "month" | "last15" | "all") {
    if (kind === "month") {
      const from = `${defaultDate.slice(0, 7)}-01`;
      setFromDate(from); setToDate(defaultDate); setRangeLabel("Tháng vận hành");
      void loadRange(from, defaultDate, false);
    } else if (kind === "last15") {
      const from = addDaysIso(defaultDate, -14);
      setFromDate(from); setToDate(defaultDate); setRangeLabel("15 ngày gần nhất");
      void loadRange(from, defaultDate, false);
    } else {
      setRangeLabel("Xem tất cả");
      void loadRange("2026-01", defaultDate, true);
    }
  }

  function applyManualRange() {
    setRangeLabel("Tuỳ chọn");
    void loadRange(fromDate, toDate, false);
  }

  const dailyValuesByDate = useMemo(() => {
    const grouped = new Map<string, Record<string, string>>();
    for (const entry of dailyInputs) grouped.set(entry.operatingDate, { ...(grouped.get(entry.operatingDate) || {}), [entry.fieldCode]: entry.value });
    return grouped;
  }, [dailyInputs]);

  const actualByDate = useMemo(() => new Map([...dailyValuesByDate].map(([date, values]) => [date, calculateActualHeatRate(values)])), [dailyValuesByDate]);

  const rows: Row[] = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.operatingDate.localeCompare(b.operatingDate))
      .map(entry => {
        const actual = actualByDate.get(entry.operatingDate) || null;
        const daily = dailyValuesByDate.get(entry.operatingDate) || {};
        const capacityS1 = Number(daily[PPA_AVAILABLE_CAPACITY_S1_CODE]);
        const capacityS2 = Number(daily[PPA_AVAILABLE_CAPACITY_S2_CODE]);
        return {
          date: entry.operatingDate,
          ppaPlant: Number(entry.ppaPlant), actualPlant: actual?.actualPlant ?? null,
          ppaS1: Number(entry.ppaS1), actualS1: actual?.actualS1 ?? null,
          ppaS2: Number(entry.ppaS2), actualS2: actual?.actualS2 ?? null,
          netS1Kwh: entry.netS1Kwh !== undefined && entry.netS1Kwh !== null ? Number(entry.netS1Kwh) : null,
          netS2Kwh: entry.netS2Kwh !== undefined && entry.netS2Kwh !== null ? Number(entry.netS2Kwh) : null,
          availableCapacityS1Mw: daily[PPA_AVAILABLE_CAPACITY_S1_CODE]?.trim() !== "" && Number.isFinite(capacityS1) ? capacityS1 : null,
          availableCapacityS2Mw: daily[PPA_AVAILABLE_CAPACITY_S2_CODE]?.trim() !== "" && Number.isFinite(capacityS2) ? capacityS2 : null,
          noteS1: entry.noteS1 || "", noteS2: entry.noteS2 || "",
        };
      });
  }, [entries, actualByDate, dailyValuesByDate]);

  const missingPpaExport = useMemo(() => rows.flatMap(row => {
    const required: Array<[number | null, string, string]> = [
      [row.ppaPlant, "PPA chung", "Nhà máy"],
      [row.actualPlant, "Suất hao nhiệt thực tế chung", "Nhà máy"],
      [row.ppaS1, "PPA S1", "S1"],
      [row.actualS1, "Suất hao nhiệt thực tế S1", "S1"],
      [row.ppaS2, "PPA S2", "S2"],
      [row.actualS2, "Suất hao nhiệt thực tế S2", "S2"],
    ];
    return required
      .filter(([value]) => value === null || !Number.isFinite(value))
      .map(([, label, group]) => ({
        key: `${row.date}:${group}:${label}`,
        label: `${fullDate(row.date)} · ${label}`,
        group,
      }));
  }), [rows]);

  const rowsByMonth = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const period = row.date.slice(0, 7);
      groups.set(period, [...(groups.get(period) || []), row]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  const visiblePage=useMemo(()=>reportPage([...rows].sort((a,b)=>b.date.localeCompare(a.date)),tablePage),[rows,tablePage]);
  const visibleDates=new Set(visiblePage.items.map(row=>row.date));
  const visibleRowsByMonth=rowsByMonth.map(([month,monthRows])=>[month,monthRows.filter(row=>visibleDates.has(row.date))] as const).filter(([,monthRows])=>monthRows.length>0);

  function summaryFor(unit: UnitKey) {
    const pairs = rows.map(row => {
      const actual = unit === "plant" ? row.actualPlant : unit === "s1" ? row.actualS1 : row.actualS2;
      const ppa = unit === "plant" ? row.ppaPlant : unit === "s1" ? row.ppaS1 : row.ppaS2;
      return { date: row.date, actual, ppa, comparison: compareHeatRate(actual, ppa) };
    }).filter(item => item.actual !== null && item.ppa !== null);
    const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const exceeded = pairs.filter(item => item.comparison.status === "Vượt PPA").length;
    const met = pairs.filter(item => item.comparison.status === "Đạt").length;
    return {
      avgActual: avg(pairs.map(item => item.actual as number)),
      avgPpa: avg(pairs.map(item => item.ppa as number)),
      avgDiff: avg(pairs.map(item => item.comparison.difference as number)),
      exceeded, met, total: pairs.length,
    };
  }

  const chartData = (unit: UnitKey) => rows.map(row => {
    const actual = unit === "plant" ? row.actualPlant : unit === "s1" ? row.actualS1 : row.actualS2;
    const ppa = unit === "plant" ? row.ppaPlant : unit === "s1" ? row.ppaS1 : row.ppaS2;
    const comparison = compareHeatRate(actual, ppa);
    return { date: shortDate(row.date), thucTe: actual, ppa, chenhLech: comparison.difference };
  });

  const noteworthy = useMemo(() => rows.filter(row => compareHeatRate(row.actualPlant, row.ppaPlant).status === "Vượt PPA"), [rows]);
  const hasSavedPpaForSheet = entries.some(entry => entry.operatingDate === sheetDate);
  const sheetRow = rows.find(row => row.date === sheetDate);
  const hasAvailableCapacityForSheet = Boolean(sheetRow && sheetRow.availableCapacityS1Mw !== null && sheetRow.availableCapacityS2Mw !== null);
  const sheetDisabledReason = !hasSavedPpaForSheet
    ? "Ngày này chưa có kết quả PPA đã lưu."
    : !hasAvailableCapacityForSheet
      ? "Ngày này chưa nhập đủ Công suất khả dụng S1 và S2. Bấm vào ngày trong bảng chi tiết để bổ sung."
      : "";

  async function exportXlsx() {
    setExporting(true); setError("");
    try {
      const XLSX = await loadSheetJs();
      const workbook = XLSX.utils.book_new();
      const usedSheetNames = new Set<string>();
      const addSheet = (wantedName: string, sheet: unknown) => {
        let name = wantedName.slice(0, 31), suffix = 2;
        while (usedSheetNames.has(name)) { name = `${wantedName.slice(0, 28)}_${suffix}`.slice(0, 31); suffix += 1; }
        usedSheetNames.add(name);
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      };

      addSheet("Cả nhà máy DH1", buildPlantSheet(XLSX, rowsByMonth));

      // Sheet "S1"/"S2" (chi tiết 48 chu kỳ/ngày) và 1 sheet/ngày (số liệu công tơ) chỉ dựng
      // được từ dữ liệu gốc đã lưu (source_data) — gọi riêng với includeSource=1 vì API tải
      // trang không kèm phần này (nặng, chỉ cần khi xuất file).
      const periods = periodsBetween(fromDate, toDate);
      for (const period of periods) {
        const entries = (await fetchPpaWithSource(period) as StoredPpaWithSource[])
          .filter(entry => entry.operatingDate >= fromDate && entry.operatingDate <= toDate && entry.source)
          .sort((a, b) => a.operatingDate.localeCompare(b.operatingDate));
        if (!entries.length) continue;
        const year = Number(period.slice(0, 4));
        const s1Days: { iso: string; detail: UnitDetail }[] = [];
        const s2Days: { iso: string; detail: UnitDetail }[] = [];
        for (const entry of entries) {
          if (!entry.source) continue;
          try {
            const detailed = calculatePpaHeatRateDetailed(entry.source, year);
            s1Days.push({ iso: entry.operatingDate, detail: detailed.s1 });
            s2Days.push({ iso: entry.operatingDate, detail: detailed.s2 });
            addSheet(ddMM(entry.operatingDate), buildMeterSheet(XLSX, entry.operatingDate, entry.source));
          } catch {
            // Bỏ qua ngày có dữ liệu công tơ gốc không còn hợp lệ (ví dụ thiếu đủ 48 chu kỳ) —
            // các sheet khác vẫn xuất bình thường.
          }
        }
        const monthSuffix = periods.length > 1 ? `_${period.replace("-", "")}` : "";
        if (s1Days.length) addSheet(`S1${monthSuffix}`, buildUnitSheet(XLSX, s1Days, year));
        if (s2Days.length) addSheet(`S2${monthSuffix}`, buildUnitSheet(XLSX, s2Days, year));
      }

      XLSX.writeFile(workbook, `so-sanh-ppa-${fromDate}_${toDate}.xlsx`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa xuất được file Excel.");
    } finally { setExporting(false); }
  }

  function requestExportXlsx() {
    if (loading || error) return;
    if (missingPpaExport.length) {
      setExportMissingOpen(true);
      return;
    }
    void exportXlsx();
  }

  function continuePpaExport() {
    setExportMissingOpen(false);
    void exportXlsx();
  }

  return <section className="ppa-dashboard space-y-4">
    <ExportMissingDialog
      open={exportMissingOpen}
      items={missingPpaExport}
      title="So sánh suất hao nhiệt thực tế và PPA trong khoảng đã chọn"
      onClose={() => setExportMissingOpen(false)}
      onItemClick={goToPpaMissingRow}
      onFillMissing={() => { setExportMissingOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      onExportAnyway={continuePpaExport}
    />
    {/* Thanh điều khiển nền xanh đậm như các trang KTKT khác: khoảng ngày bên trái, Google Sheet/Excel bên phải. */}
    {/* Một khối điều khiển duy nhất: tab chức năng (hàng trên) + khoảng ngày, chọn nhanh, Sheet/Excel (hàng dưới). */}
    <div className="ppa-command-bar">
      {tabs}
      <div className="ppa-cmd-controls">
        <div className="ppa-cmd-range" role="group" aria-label="Khoảng ngày">
          <span className="ppa-cmd-label"><CalendarRange className="size-4" aria-hidden />Khoảng ngày</span>
          <DateField value={fromDate} max={toDate} onChange={setFromDate} placeholder="Từ ngày" className="ppa-cmd-date"/>
          <ArrowRight className="ppa-cmd-sep size-4" aria-hidden />
          <DateField value={toDate} min={fromDate} max={today} onChange={setToDate} placeholder="Đến ngày" className="ppa-cmd-date"/>
          <button type="button" onClick={applyManualRange} className="ppa-cmd-apply">Áp dụng</button>
        </div>
        <div className="ppa-cmd-presets" role="group" aria-label="Chọn nhanh khoảng ngày">
          <button type="button" onClick={() => applyQuick("month")} aria-pressed={rangeLabel === "Tháng vận hành"}>Tháng vận hành</button>
          <button type="button" onClick={() => applyQuick("last15")} aria-pressed={rangeLabel === "15 ngày gần nhất"}>15 ngày</button>
          <button type="button" onClick={() => applyQuick("all")} aria-pressed={rangeLabel === "Xem tất cả"}>Tất cả</button>
        </div>
        <div className="ppa-cmd-actions">
          <details className="ppa-sheet-menu"><summary className="ppa-cmd-ghost"><Sheet className="size-4" aria-hidden />Google Sheet<ChevronDown className="size-3.5" aria-hidden /></summary><div className="ppa-sheet-menu-content">
            <label className="ppa-sheet-date">Ngày Google Sheet<DateField value={sheetDate} onChange={setSheetDate} className="w-[150px]"/></label>
            <GoogleSheetSyncButton compact operatingDate={sheetDate} disabled={!hasSavedPpaForSheet || !hasAvailableCapacityForSheet} disabledReason={sheetDisabledReason} onImported={() => loadRange(fromDate, toDate, false)}/>
          </div></details>
          <button type="button" disabled={exporting || loading || !rows.length} onClick={requestExportXlsx} className="ppa-cmd-primary"><Download className="size-4" aria-hidden />{exporting ? "Đang xuất…" : "Xuất Excel"}</button>
        </div>
      </div>
    </div>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">{error}</p>}
    {!loading && restoredCount !== null && <p role="status" className="ppa-restored-status text-xs text-slate-500">Đã khôi phục {restoredCount} ngày kết quả đã lưu trên website.</p>}

    {noteworthy.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <button type="button" onClick={() => setNotesOpen(open => !open)} className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold text-amber-900">
        <span>{noteworthy.length} lưu ý trong kết quả đã lưu — bấm mở bên dưới bảng để xem chi tiết</span>
        <span className="text-xs">{notesOpen ? "Thu gọn ▲" : "Mở rộng ▼"}</span>
      </button>
      {notesOpen && <ul className="mt-3 space-y-1.5 border-t border-amber-200 pt-3">
        {noteworthy.map(row => <li key={row.date} className="text-xs text-amber-900"><span className="font-bold">{fullDate(row.date)}</span> — vượt PPA chung. {row.noteS1 || row.noteS2 ? <>S1: {row.noteS1 || "—"}; S2: {row.noteS2 || "—"}</> : <span className="italic">Chưa ghi nguyên nhân.</span>}</li>)}
      </ul>}
    </div>}

    <div className="ppa-unit-grid">
      {(["s1", "s2", "plant"] as UnitKey[]).map(unit => {
        const summary = summaryFor(unit);
        const unitChartData = chartData(unit);
        return <PpaUnitCard key={unit} unit={unit} summary={summary} points={unitChartData} />;
      })}
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#f8fafc] px-4 py-3"><h2 className="font-extrabold text-[#20345f]">Bảng chi tiết theo ngày</h2><span className="ppa-detail-legend"><span className="ppa-legend-over">CL đỏ: vượt PPA</span><span className="ppa-legend-met">CL xanh: đạt PPA</span><span>SHN: kJ/kWh · CS: MW</span></span></div>
      {!rows.length ? <div className="grid min-h-40 place-items-center p-6 text-sm text-slate-500">{loading ? "Đang tải dữ liệu…" : "Chưa có kết quả đã lưu trong khoảng thời gian này."}</div> : <div className="module-table-scroll w-full min-w-0 max-w-full overflow-x-scroll overflow-y-auto" tabIndex={0} role="region" aria-label="Bảng PPA theo ngày, cuộn ngang để xem các cột">
        <table className="report-data-table ppa-detail-table">
          <colgroup>
            <col style={{ width: 70 }}/>
            {Array.from({ length: 14 }, (_, index) => <col key={index} style={{ width: [3,8,13].includes(index) ? 74 : 98 }}/>) }
            <col style={{ width: 140 }}/>
            <col style={{ width: 140 }}/>
          </colgroup>
          <thead>
            <tr className="bg-[#dcebf5] text-[#173b64]">
              <th rowSpan={2} className="px-1 py-2 text-center align-bottom">Ngày</th>
              <th colSpan={4} className="border-l border-white/60 p-2 text-center text-purple-900">Chung 2 tổ</th>
              <th colSpan={5} className="border-l border-white/60 p-2 text-center text-blue-900">Tổ máy S1</th>
              <th colSpan={5} className="border-l border-white/60 p-2 text-center text-amber-900">Tổ máy S2</th>
              <th rowSpan={2} className="border-l border-white/60 bg-blue-100 px-1 py-2 text-left align-bottom text-blue-950">Nhận xét S1</th>
              <th rowSpan={2} className="border-l border-white/60 bg-amber-100 px-1 py-2 text-left align-bottom text-amber-950">Nhận xét S2</th>
            </tr>
            <tr className="bg-[#eaf3fa] text-[#173b64]">
              {["Thực tế", "PPA", "CL kJ/kWh", "CL %", "Thực tế", "PPA", "CS khả dụng", "CL kJ/kWh", "CL %", "Thực tế", "PPA", "CS khả dụng", "CL kJ/kWh", "CL %"].map((label, index) => <th key={index} className="border-l border-white/60 px-0.5 py-1.5 text-center font-semibold leading-tight">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...visibleRowsByMonth].reverse().map(([period, monthRows]) => <Fragment key={period}>
              <tr className="bg-slate-100"><td colSpan={17} className="ppa-month-label px-2 py-1.5 text-left font-extrabold uppercase tracking-wide text-slate-500">{monthLabel(period)}</td></tr>
              {[...monthRows].sort((a, b) => b.date.localeCompare(a.date)).map(row => {
                const plant = compareHeatRate(row.actualPlant, row.ppaPlant), s1 = compareHeatRate(row.actualS1, row.ppaS1), s2 = compareHeatRate(row.actualS2, row.ppaS2);
                const differenceCells = (comparison: ReturnType<typeof compareHeatRate>) => {
                  const tone = comparison.status === "Vượt PPA" ? "ppa-cl-over" : comparison.status === "Đạt" ? "ppa-cl-met" : "ppa-cl-empty";
                  return <><td className={tone} title={comparison.status}>{format(comparison.difference)}</td><td className={tone} title={comparison.status}>{formatPercent(comparison.percent)}</td></>;
                };
                return <tr id={`ppa-row-${row.date}`} key={row.date} className="border-t border-slate-200 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-0.5 py-1 text-center font-bold text-black">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditNote(row)}
                        className="text-center font-bold text-[#18233d] hover:text-[#4057b5] hover:underline"
                        title={`Bấm để xem hoặc chỉnh sửa nhận xét ngày ${fullDate(row.date)}`}
                      >
                        <span>{shortDate(row.date)}</span>
                      </button>
                    ) : (
                      <>
                        <span title={fullDate(row.date)}>{shortDate(row.date)}</span>
                      </>
                    )}
                  </td>
                  <td>{format(row.actualPlant)}</td><td>{format(row.ppaPlant)}</td>{differenceCells(plant)}
                  <td>{format(row.actualS1)}</td><td>{format(row.ppaS1)}</td><td className="bg-blue-50/50 text-blue-900">{format(row.availableCapacityS1Mw)}</td>{differenceCells(s1)}
                  <td>{format(row.actualS2)}</td><td>{format(row.ppaS2)}</td><td className="bg-amber-50/50 text-amber-900">{format(row.availableCapacityS2Mw)}</td>{differenceCells(s2)}
                  <td className="border-l bg-blue-50/40 p-1 align-middle text-slate-700">
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        {row.noteS1 ? (
                          <PpaNotePreview date={row.date} noteS1={row.noteS1} noteS2={row.noteS2} unit="s1" />
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => openEditNote(row)}
                            className="text-[13px] italic text-blue-600/70 hover:text-blue-900 hover:underline"
                            title="Bổ sung nhận xét S1"
                          >
                            + Nhận xét
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                      {canEdit && row.noteS1 && (
                        <button
                          type="button"
                          onClick={() => openEditNote(row)}
                          className="shrink-0 rounded p-0.5 text-[13px] text-blue-600 opacity-40 transition hover:bg-blue-200 hover:opacity-100"
                          title={`Chỉnh sửa nhận xét ngày ${fullDate(row.date)}`}
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border-l bg-amber-50/40 p-1 align-middle text-slate-700">
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        {row.noteS2 ? (
                          <PpaNotePreview date={row.date} noteS1={row.noteS1} noteS2={row.noteS2} unit="s2" />
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => openEditNote(row)}
                            className="text-[13px] italic text-amber-700/70 hover:text-amber-900 hover:underline"
                            title="Bổ sung nhận xét S2"
                          >
                            + Nhận xét
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                      {canEdit && row.noteS2 && (
                        <button
                          type="button"
                          onClick={() => openEditNote(row)}
                          className="shrink-0 rounded p-0.5 text-[13px] text-amber-700 opacity-40 transition hover:bg-amber-200 hover:opacity-100"
                          title={`Chỉnh sửa nhận xét ngày ${fullDate(row.date)}`}
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>;
              })}
            </Fragment>)}
          </tbody>
        </table>
      </div>}
      <ReportTablePager {...visiblePage} onChange={setTablePage} disabled={loading}/>
    </div>

    {editModal.isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-[#20345f]">
                Thông số bổ sung ngày {fullDate(editModal.date)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Nhập công suất khả dụng và nguyên nhân chênh lệch PPA
              </p>
            </div>
            <button
              type="button"
              disabled={editModal.saving}
              onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          {editModal.error && (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {editModal.error}
            </p>
          )}

          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-blue-900">
                Công suất khả dụng S1 (MW)
                <input
                  value={editModal.availableCapacityS1Mw}
                  onChange={e => setEditModal(prev => ({ ...prev, availableCapacityS1Mw: e.target.value }))}
                  inputMode="decimal"
                  className="rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-sm font-semibold text-black outline-none focus:border-[#4c78a8] focus:ring-2 focus:ring-[#4c78a8]/20"
                  placeholder="Ví dụ: 622,5"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-amber-900">
                Công suất khả dụng S2 (MW)
                <input
                  value={editModal.availableCapacityS2Mw}
                  onChange={e => setEditModal(prev => ({ ...prev, availableCapacityS2Mw: e.target.value }))}
                  inputMode="decimal"
                  className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-sm font-semibold text-black outline-none focus:border-[#4c78a8] focus:ring-2 focus:ring-[#4c78a8]/20"
                  placeholder="Ví dụ: 622,5"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-blue-900">Nhận xét / Nguyên nhân chênh lệch Tổ máy S1</span>
                <span className="font-normal text-slate-400">{editModal.noteS1.length}/1000 ký tự</span>
              </div>
              <textarea
                value={editModal.noteS1}
                onChange={e => setEditModal(prev => ({ ...prev, noteS1: e.target.value }))}
                rows={3}
                className="resize-y rounded-xl border border-slate-300 p-3 text-xs font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-2 focus:ring-[#4c78a8]/20"
                placeholder="Ghi nhận tình trạng vận hành S1, độ tro/xỉ, máy nghiền, chất lượng than…"
              />
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-amber-900">Nhận xét / Nguyên nhân chênh lệch Tổ máy S2</span>
                <span className="font-normal text-slate-400">{editModal.noteS2.length}/1000 ký tự</span>
              </div>
              <textarea
                value={editModal.noteS2}
                onChange={e => setEditModal(prev => ({ ...prev, noteS2: e.target.value }))}
                rows={3}
                className="resize-y rounded-xl border border-slate-300 p-3 text-xs font-normal text-black outline-none focus:border-[#4c78a8] focus:ring-2 focus:ring-[#4c78a8]/20"
                placeholder="Ghi nhận tình trạng vận hành S2, độ tro/xỉ, máy nghiền, chất lượng than…"
              />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={editModal.saving}
              onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={editModal.saving}
              onClick={handleSaveNote}
              className="rounded-xl bg-gradient-to-r from-[#4057b5] to-[#438ec1] px-5 py-2 text-xs font-bold text-white shadow-md hover:opacity-95 disabled:opacity-50"
            >
              {editModal.saving ? "Đang lưu…" : "Lưu thông tin"}
            </button>
          </div>
        </div>
      </div>
    )}
  </section>;
}
