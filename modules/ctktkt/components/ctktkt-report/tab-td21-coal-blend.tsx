"use client";
// Tab 4 · Cụm 9 & 14 — điện tự dùng TD21, than trộn PMIS.
import { canEditCtktktField } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { createZeroCoalConsumptionCorrection } from "@/modules/ctktkt/lib/ctktkt-report";
import { format } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktTd21CoalBlendTab({ ctx }: { ctx: CtktktReportCtx }) {
  const { user, canEditSelectedDate, loading, saving, setMessage, setError, stageValues, previous, current, coalShiftDetails, renderCellInput } = ctx;
  return (
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
                const adjustmentCell = (item.unit === "S1" ? ["W28", "Y28", "AA28"] : ["AG28", "AI28", "AK28"])[item.shift - 1];
                const canConfirmNoCoal = canEditSelectedDate && canEditCtktktField(user, adjustmentCell) && canEditCtktktField(user, `COAL_ADJ_NOTE_${item.unit}`);
                return (
                  <tr key={`${item.unit}-${item.shift}`} className={item.unit === "S2" ? "bg-slate-50/60" : "bg-white"}>
                    <td className="p-2 text-center font-sans font-extrabold text-[#173b64] text-xs">{item.unit}</td>
                    <td className="p-2 text-center font-sans font-normal text-xs">Ca {item.shift}</td>
                    <td className="p-2 text-center tabular-nums text-xs">{format(item.rawCoalTonnes)}</td>
                    <td className="p-1.5 bg-yellow-50/60">{renderCellInput(`AJ${row}`, { group: "coal_blend_pmis" })}</td>
                    <td className="p-1.5 bg-yellow-50/60">{renderCellInput(`AK${row}`, { group: "coal_blend_pmis" })}</td>
                    <td className="p-2 text-center tabular-nums text-xs">
                      {format(item.adjustedCoalTonnes)}
                      {item.rawCoalTonnes !== null && item.rawCoalTonnes > 0 && item.dryKcalKg !== null && item.dryKcalKg <= 0 && (
                        <span role="alert" className="mt-1 block font-sans text-[11px] text-amber-800">
                          Cân còn {format(item.rawCoalTonnes)} tấn; Qk = 0. Kiểm tra chỉ số cân và số liệu than. Wtp/Qk = 0 không đưa lượng than về 0.
                          {canConfirmNoCoal && <button type="button" disabled={loading || saving} className="mt-1 block min-h-9 w-full rounded border border-amber-400 bg-amber-50 px-2 py-1 font-semibold disabled:opacity-50" onClick={() => {
                            try {
                              stageValues(createZeroCoalConsumptionCorrection(current, previous, item.unit, item.shift));
                              setError("");
                              setMessage(`Đã lập hiệu chỉnh ${item.unit} ca ${item.shift} về 0 theo xác nhận không tiêu thụ than, giữ nguyên chỉ số cân. Bấm Lưu số liệu; ngoài thời gian chốt ngày, số khác ca/người nhập cần quản trị duyệt.`);
                            } catch (reason) { setError(reason instanceof Error ? reason.message : "Chưa lập được hiệu chỉnh cân than."); }
                          }}>Xác nhận {item.unit} ca {item.shift} ngừng, không dùng than</button>}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center tabular-nums text-xs">{format(item.asReceivedKcalKg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
