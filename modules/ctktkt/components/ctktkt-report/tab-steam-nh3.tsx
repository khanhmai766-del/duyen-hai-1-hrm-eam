"use client";
// Tab 3 · Cụm 6 & 8 — lưu lượng hơi, bồn NH3.
import { STEAM_HOURS } from "@/modules/ctktkt/lib/ctktkt-report";
import { isMissingValue } from "@/modules/ctktkt/lib/data-completeness";
import { format } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktSteamNh3Tab({ ctx }: { ctx: CtktktReportCtx }) {
  const { date, previousDate, current, steamS1, steamS2, nh3, nh3Dcs, renderCellInput } = ctx;
  return (
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
  );
}
