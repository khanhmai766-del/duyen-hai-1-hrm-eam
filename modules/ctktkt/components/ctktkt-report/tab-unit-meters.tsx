"use client";
// Tab 2 · Cụm 4 & 5 — công tơ tổ máy S1/S2 (điện, dầu lò phó, than máy nghiền, thống kê).
import { Camera, Images } from "lucide-react";
import { canReviewCoalPhotos } from "@/modules/ctktkt/lib/coal-photo-review";
import { calculateCoalMeterShiftConsumption, OIL_HOURS } from "@/modules/ctktkt/lib/ctktkt-report";
import { format, coalConsumptionCellClass } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktUnitMetersTab({ ctx }: { ctx: CtktktReportCtx }) {
  const { user, unitView, setUnitView, setCoalReviewUnit, setCoalPhotoOpen, previous, current, summary, oilS1, oilS2, renderCellInput } = ctx;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div>
          <h3 className="text-sm font-black text-[#173b64]">
            Cụm 4 & 5: Bảng ghi công tơ Tổ máy S1 & Tổ máy S2
          </h3>
<button type="button" className="min-h-10 rounded-lg border border-blue-300 px-3 text-sm font-semibold text-blue-800" onClick={()=>window.dispatchEvent(new Event('ktkt-open-correction'))}>Đề xuất chỉnh sửa công tơ</button>
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
                    <th className="p-1.5 text-center font-bold" title="Nhập khi công tơ bị reset/thay trong ngày: lượng điện cần cộng thêm vào (số cuối ngày − số cuối ngày D-1)">Hiệu chỉnh reset</th>
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S1_8", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S1_9", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S1_10", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S1_11", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-800 font-sans">Lý do hiệu chỉnh công tơ điện</td>
                    <td colSpan={6} className="p-1.5 text-xs font-sans">
                      {renderCellInput("ELEC_RESET_NOTE_S1", { group: "tpd_tcd_power", placeholder: "Vd. Công tơ MBT reset lúc 22h: bù số trước reset + điện đi qua", maxLength: 500 })}
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
                {canReviewCoalPhotos(user)&&<button type="button" onClick={()=>setCoalReviewUnit("S1")} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"><Images className="size-3.5" aria-hidden/>Đối chiếu ảnh & số liệu</button>}
                <span className="text-[11px] font-bold text-slate-800">
                  Cương vị nhập: Vận hành viên Máy nghiền S1
                </span>
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="report-data-table min-w-[1450px] w-full text-xs">
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
                    <th className="p-1.5 text-center font-bold" title="Nhập khi công tơ bị reset/thay trong ngày: lượng điện cần cộng thêm vào (số cuối ngày − số cuối ngày D-1)">Hiệu chỉnh reset</th>
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S2_8", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S2_9", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S2_10", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
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
                    <td className="p-1.5 text-center text-xs">
                      {renderCellInput("ELEC_RESET_S2_11", { group: "tpd_tcd_power", placeholder: "0", isNumber: true })}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-800 font-sans">Lý do hiệu chỉnh công tơ điện</td>
                    <td colSpan={6} className="p-1.5 text-xs font-sans">
                      {renderCellInput("ELEC_RESET_NOTE_S2", { group: "tpd_tcd_power", placeholder: "Vd. Công tơ MBT reset lúc 22h: bù số trước reset + điện đi qua", maxLength: 500 })}
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
                {canReviewCoalPhotos(user)&&<button type="button" onClick={()=>setCoalReviewUnit("S2")} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"><Images className="size-3.5" aria-hidden/>Đối chiếu ảnh & số liệu</button>}
                <span className="text-[11px] font-bold text-slate-800">
                  Cương vị nhập: Vận hành viên Máy nghiền S2
                </span>
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="report-data-table min-w-[1450px] w-full text-xs">
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
  );
}
