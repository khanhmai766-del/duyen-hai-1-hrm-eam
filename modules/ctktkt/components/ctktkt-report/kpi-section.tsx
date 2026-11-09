"use client";
// Cụm 1 — bảng kết quả KPI tính tự động & ô nhập tay (I35, I36, W87).
import { ctktktMetricDisplay } from "../../lib/ctktkt-report";
import { ChevronDown, ChevronUp, Mail } from "lucide-react";
import { COAL_STOCK_24H_START_CELL } from "@/modules/ctktkt/lib/coal-stock";
import { metricRows, meterComparisonKeys, format } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktKpiSection({ ctx }: { ctx: CtktktReportCtx }) {
  const { isKpiCollapsed, setIsKpiCollapsed, setShowEmailModal, current, isFirstDayOfMonth, pmisCoalStock, hoursMissingUpToDate, summary, meterSummary, renderCellInput } = ctx;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="module-section-heading flex flex-wrap items-center justify-between gap-2 border-b bg-[#f8faff] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="module-table-scroll">
            <table className="report-data-table w-full min-w-[980px] text-xs">
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
  );
}
