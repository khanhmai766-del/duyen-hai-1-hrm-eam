"use client";
// Tab 6 · Báo cáo PMIS 02-PĐ & đối chiếu ngày (sản lượng, chỉ tiêu KTKT).
import { PMIS_AUX_SOURCE_LABEL, calculatePmisAuxiliary } from "../../lib/ctktkt-pmis-auxiliary";
import { Save, RefreshCw } from "lucide-react";
import { canEditCtktktGroup } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { format, num } from "./shared";
import type { CtktktReportCtx } from "./use-ctktkt-report";

export function CtktktPmisReportsTab({ ctx }: { ctx: CtktktReportCtx }) {
  const { user, canEditSelectedDate, userCanEditAny, saving, extensionVersion, extensionOutdated, syncingPmis, previous, current, save, syncPmis02PdFromQlkt, renderCellInput } = ctx;
            const j157 = num(current, "J157");
            const k157 = num(current, "K157");
            const j158 = num(current, "J158");
            const k158 = num(current, "K158");
            // Tổng tự dùng PMIS (L157/L158): cùng quy tắc với file xuất (ctktkt-pmis-auxiliary.ts).
            const pmisAux = calculatePmisAuxiliary({ values: current, previousTd21: previous?.R49 });
            const l157 = pmisAux.S1.value;
            const l158 = pmisAux.S2.value;

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
                          <td className="border border-slate-400 px-2 py-1.5 text-center text-xs">
                            <div className="font-mono text-red-300">{l157 !== null ? format(l157) : "—"}</div>
                            <div className="mt-0.5 text-[10px] leading-tight text-emerald-100">{PMIS_AUX_SOURCE_LABEL[pmisAux.S1.source]}</div>
                            {renderCellInput("PMIS_AUX_MANUAL_S1", {
                              group: "pmis_reports",
                              isNumber: true,
                              placeholder: "Nhập tay (nếu cần)",
                              className: "mt-1 !bg-[#005a00] !text-white text-xs text-center placeholder:!text-emerald-200",
                            })}
                            {num(current, "PMIS_AUX_MANUAL_S1") !== null && renderCellInput("PMIS_AUX_NOTE_S1", {
                              group: "pmis_reports",
                              placeholder: "Lý do, vd. nhận XT 283 đến 10h rồi cắt MBA, chuyển TD21",
                              maxLength: 300,
                              className: "mt-1 !bg-[#005a00] !text-white text-[11px] placeholder:!text-emerald-200",
                            })}
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
                          <td className="border border-slate-400 px-2 py-1.5 text-center text-xs">
                            <div className="font-mono text-red-300">{l158 !== null ? format(l158) : "—"}</div>
                            <div className="mt-0.5 text-[10px] leading-tight text-emerald-100">{PMIS_AUX_SOURCE_LABEL[pmisAux.S2.source]}</div>
                            {renderCellInput("PMIS_AUX_MANUAL_S2", {
                              group: "pmis_reports",
                              isNumber: true,
                              placeholder: "Nhập tay (nếu cần)",
                              className: "mt-1 !bg-[#005a00] !text-white text-xs text-center placeholder:!text-emerald-200",
                            })}
                            {num(current, "PMIS_AUX_MANUAL_S2") !== null && renderCellInput("PMIS_AUX_NOTE_S2", {
                              group: "pmis_reports",
                              placeholder: "Lý do, vd. nhận XT 283 đến 10h rồi cắt MBA, chuyển TD21",
                              maxLength: 300,
                              className: "mt-1 !bg-[#005a00] !text-white text-[11px] placeholder:!text-emerald-200",
                            })}
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
                    <span className="text-slate-500">Tự dùng PMIS: có phát = (đầu cực − xuất tuyến) + nhận xuất tuyến; không phát = nhận xuất tuyến của tổ (285/283), không nhận thì lấy công tơ TD21. Trường hợp đặc biệt (nhận XT rồi cắt MBA…) nhập tay.</span>
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
}
