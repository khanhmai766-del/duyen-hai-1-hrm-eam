"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { useDailyInputsRange } from "@/hooks/useKtktDailyInputs";
import { defaultOperatingDate } from "../lib/operating-date";
import {
  buildPeriodStatistics, STATISTICS_GROUPS, STATISTICS_MODES, statisticsDateLabel,
  statisticsPeriod, statisticsSheetRows, type StatisticsGroup, type StatisticsMode,
  type StatisticsRequest, type StatisticsRow,
} from "../lib/period-statistics";
import { DateField } from "./ui/date-field";
import { MonthField } from "./ui/month-field";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });
const fieldClass = "grid min-w-0 gap-1 text-sm font-semibold text-slate-700";
const selectClass = "h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-base text-slate-900 sm:text-sm";
const firstSupportedDay = "1900-01-01";

function PeriodRows({ rows, group }: { rows: StatisticsRow[]; group: StatisticsGroup }) {
  return rows.map(row => (
    <TableRow key={row.from}>
      <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-left font-semibold text-slate-800">
        {row.label}
      </th>
      <TableCell className="text-right tabular-nums">{row.coverage[group.id]}/{row.days}</TableCell>
      {group.columns.map(([code, , unit]) => (
        <TableCell key={code} className="text-right tabular-nums">
          {row.values[code] == null ? "—" : (unit === "%" ? percentFormat : numberFormat).format(row.values[code])}
        </TableCell>
      ))}
    </TableRow>
  ));
}

export function DailyPeriodStatistics() {
  const id = useId();
  const latest = defaultOperatingDate();
  const latestYear = Number(latest.slice(0, 4));
  const [mode, setMode] = useState<StatisticsMode>("month");
  const [anchor, setAnchor] = useState(latest);
  const [limits, setLimits] = useState(() => statisticsPeriod("month", latest, latest));
  const [from, setFrom] = useState(limits.from);
  const [to, setTo] = useState(limits.to);
  const [selected, setSelected] = useState<StatisticsRequest | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const year = Number(anchor.slice(0, 4));
  const quarter = Math.ceil(Number(anchor.slice(5, 7)) / 3);
  const lastQuarter = year === latestYear ? Math.ceil(Number(latest.slice(5, 7)) / 3) : 4;
  const valid = from >= limits.from && to <= limits.to && from <= to;
  const active = selected && selected.mode === mode && selected.from === from && selected.to === to ? selected : null;
  const query = useDailyInputsRange(active?.from ?? "", active?.to ?? "");
  const result = useMemo(() => active && query.data && !query.isPlaceholderData
    ? buildPeriodStatistics(query.data, active)
    : null, [active, query.data, query.isPlaceholderData]);
  const hasData = Boolean(result && Object.values(result.total.coverage).some(count => count > 0));

  function choosePeriod(nextMode: StatisticsMode, nextAnchor: string) {
    if (nextAnchor < firstSupportedDay) return;
    const date = nextAnchor > latest ? latest : nextAnchor;
    const range = statisticsPeriod(nextMode, date, latest);
    setMode(nextMode);
    setAnchor(date);
    setLimits(range);
    setFrom(range.from);
    setTo(range.to);
    setExportError("");
  }

  function showStatistics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    setExportError("");
    if (active) {
      void query.refetch();
    } else {
      setSelected({ mode, from, to });
    }
  }

  async function exportExcel() {
    if (!active || !result || !hasData || exporting || query.isFetching || query.isError) return;
    setExportError("");
    setExporting(true);
    try {
      const { utils, writeFileXLSX } = await import("xlsx");
      const workbook = utils.book_new();
      for (const group of STATISTICS_GROUPS) {
        const sheet = utils.aoa_to_sheet(statisticsSheetRows(result, active, group));
        sheet["!cols"] = [
          { wch: 17 }, { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 17 },
          ...group.columns.map(([, label, unit]) => ({ wch: Math.max(label.length + unit.length + 4, 16) })),
        ];
        utils.book_append_sheet(workbook, sheet, group.label);
      }
      writeFileXLSX(workbook, `Thong_ke_KTKT_DH1_${active.from}_${active.to}.xlsx`);
    } catch {
      setExportError("Chưa xuất được Excel. Vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <form onSubmit={showStatistics} className="space-y-3 px-3 py-4 sm:px-5">
        <h3 id={`${id}-heading`} className="text-base font-bold text-[#173b64]">Thống kê theo kỳ</h3>
        <fieldset className="min-w-0">
          <legend className="sr-only">Loại kỳ thống kê</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STATISTICS_MODES.map(option => (
              <label key={option.value} className="inline-flex min-h-10 cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-800">
                <input type="radio" name={`${id}-mode`} value={option.value} checked={mode === option.value}
                  onChange={() => choosePeriod(option.value, anchor)} className="size-4 accent-blue-700" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {(mode === "year" || mode === "quarter") && (
            <label className={fieldClass}>Năm
              <select value={year} onChange={event => choosePeriod(mode, `${event.target.value}-${anchor.slice(5, 7)}-01`)} className={selectClass}>
                {Array.from({ length: latestYear - 1899 }, (_, index) => latestYear - index).map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
          {mode === "quarter" && (
            <label className={fieldClass}>Quý
              <select value={quarter} onChange={event => choosePeriod(mode, `${year}-${String((Number(event.target.value) - 1) * 3 + 1).padStart(2, "0")}-01`)} className={selectClass}>
                {Array.from({ length: lastQuarter }, (_, index) => index + 1).map(item => (
                  <option key={item} value={item}>Quý {item}</option>
                ))}
              </select>
            </label>
          )}
          {mode === "month" && (
            <label className={fieldClass}>Tháng
              <MonthField value={anchor.slice(0, 7)} min="1900-01" max={latest.slice(0, 7)}
                aria-label="Tháng thống kê" onChange={event => {
                  if (event.target.value) choosePeriod(mode, `${event.target.value}-01`);
                }} />
            </label>
          )}
          {(mode === "week" || mode === "day") && (
            <label className={fieldClass}>{mode === "week" ? "Ngày trong tuần" : "Ngày thống kê"}
              <DateField value={anchor} min={firstSupportedDay} max={latest}
                placeholder={mode === "week" ? "Chọn ngày trong tuần" : "Chọn ngày thống kê"}
                onChange={date => choosePeriod(mode, date)} />
            </label>
          )}
          {mode !== "day" && <>
            <label className={fieldClass}>Từ ngày
              <DateField value={from} min={limits.from} max={to} placeholder="Từ ngày" onChange={setFrom} />
            </label>
            <label className={fieldClass}>Đến ngày
              <DateField value={to} min={from} max={limits.to} placeholder="Đến ngày" onChange={setTo} />
            </label>
          </>}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="submit" disabled={!valid || Boolean(active && query.isFetching)}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              <RefreshCw className="size-4 shrink-0" aria-hidden="true" /> Xem thống kê
            </button>
            <button type="button" onClick={exportExcel} disabled={!hasData || exporting || query.isFetching || query.isError}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
              <FileSpreadsheet className="size-4 shrink-0" aria-hidden="true" /> {exporting ? "Đang xuất…" : "Xuất Excel"}
            </button>
          </div>
        </div>
        {!valid && <p role="alert" className="text-sm text-red-700">Chọn khoảng ngày hợp lệ trong kỳ thống kê.</p>}
        {(exportError || (active && query.isError)) && (
          <p role="alert" className="text-sm text-red-700">{exportError || "Chưa tải được số liệu kỳ này. Vui lòng thử lại."}</p>
        )}
        {active && query.isFetching && <p role="status" className="text-sm text-slate-600">Đang tải số liệu kỳ đã chọn…</p>}
        {result && !hasData && !query.isFetching && (
          <p role="status" className="text-sm text-slate-600">Kỳ đã chọn chưa có số liệu.</p>
        )}
      </form>
      {result && hasData && (
        <Tabs defaultValue="production" className="min-w-0 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2 sm:px-5">
            <span className="text-sm font-semibold text-[#173b64]">
              {statisticsDateLabel(result.total.from)} – {statisticsDateLabel(result.total.to)}
            </span>
            <TabsList aria-label="Nhóm số liệu thống kê" className="h-auto min-w-0 flex-wrap justify-start">
              {STATISTICS_GROUPS.map(group => (
                <TabsTrigger key={group.id} value={group.id} className="min-h-9 flex-none">{group.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
          {STATISTICS_GROUPS.map(group => (
            <TabsContent key={group.id} value={group.id} className="min-w-0">
              <Table aria-label={`Thống kê ${group.label}`} className="min-w-max">
                <TableHeader className="bg-slate-100">
                  <TableRow>
                    <TableHead scope="col" className="sticky left-0 z-10 bg-slate-100 px-3">Kỳ</TableHead>
                    <TableHead scope="col" className="text-right">Ngày có số liệu</TableHead>
                    {group.columns.map(([code, label, unit]) => (
                      <TableHead key={code} scope="col" className="text-right">
                        {label}<span className="block text-xs font-normal text-slate-600">{unit}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody><PeriodRows rows={result.rows} group={group} /></TableBody>
                <TableFooter className="bg-blue-50 font-bold [&_th]:bg-blue-50">
                  <PeriodRows rows={[result.total]} group={group} />
                </TableFooter>
              </Table>
              <p className="px-3 py-2 text-xs text-slate-600 sm:px-5">
                “—” là ô thiếu số liệu hoặc chưa đủ dữ liệu để tính. Tổng theo kỳ dựa trên số liệu đã lưu.
                {group.id === "production" && " Tỷ lệ tự dùng tính theo chênh lệch điện đầu cực và điện điểm bán. Suất hao nhiệt tinh gia quyền theo điện điểm bán."}
                {group.id === "operation" && " Tỷ lệ SCBD bằng tổng giờ SCBD chia cho tổng giờ lịch của hai tổ máy."}
              </p>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
