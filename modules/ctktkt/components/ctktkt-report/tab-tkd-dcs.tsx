"use client";
// Tab 1 · Cụm 2 & 3 — thông số điện TKĐ/DCS, công tơ nước demin (hàng 72–74).
import { TKD_HOURS } from "@/modules/ctktkt/lib/ctktkt-report";
import { format, parseDeminNum, formatDeminDiff, formatDeminTotal, formatAdjTotal, formatResinTotal } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktTkdDcsTab({ ctx }: { ctx: CtktktReportCtx }) {
  const { date, linkedByDate, previous, current, tkdCalc, update, renderCellInput } = ctx;
  return (
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
  );
}
