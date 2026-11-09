import type { CSSProperties } from "react";
import { buildRatePaths, chartRange } from "@/modules/ctktkt/lib/ppa-chart-layout";

type Point = { date: string; thucTe: number | null; ppa: number | null; chenhLech: number | null };
type Summary = { avgActual: number | null; avgPpa: number | null; avgDiff: number | null; exceeded: number; met: number; total: number };
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const tick = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const format = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : number.format(value);
const accents = { s1: "#2563eb", s2: "#b77914", plant: "#087f8c" };
// Màu theo kết quả so với PPA: vượt (đỏ) · đạt (xanh) · chưa đủ dữ liệu (xám).
const STATUS_TONE = { over: "bg-[#fff0f0] text-[#b73939]", met: "bg-[#ecf7f1] text-[#237353]", empty: "bg-[#f1f4f8] text-[#64748b]" };
const SUMMARY_TONE = { over: "bg-[#fff5f4] text-[#b73939]", met: "bg-[#f0f8f4] text-[#237353]", empty: "bg-[#f7f9fc] text-[#64748b]" };
// Không dùng lớp `flex`/`text-[10px]`… vì styles.css của module có quy tắc chung bám theo đúng tên lớp đó.
const METRIC_P = "mx-0 mb-1 mt-0 text-[12px] text-[#52627a]";
const METRIC_P_SPAN = "ml-1 mt-[3px] inline text-[#8a95a6] [font-size:10px]";
const METRIC_VALUE = "block font-[650] tabular-nums tracking-[-.035em] [font-size:clamp(20px,1.6vw,28px)] max-[1199px]:[font-size:26px]";
const METRIC_UNIT = "text-[#8a95a6] [font-size:10px]";
const LEGEND_LINE = "mr-1.5 inline-block w-[17px] border-t-2 align-middle";
const LEGEND_SWATCH = "mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle [border:0]";

export function PpaUnitCard({ unit, summary, points }: { unit: "s1" | "s2" | "plant"; summary: Summary; points: Point[] }) {
  const title = unit === "plant" ? "Toàn nhà máy" : `Tổ máy ${unit.toUpperCase()}`;
  const hasComparison = summary.avgDiff !== null && Number.isFinite(summary.avgDiff);
  const over = hasComparison && summary.avgDiff! > 0;
  const tone = hasComparison ? over ? "over" : "met" : "empty";
  const rateDomain = chartRange(points.flatMap(p => [p.thucTe, p.ppa]), false);
  const diffDomain = chartRange(points.map(p => p.chenhLech), true);
  const left = 60, right = 440, width = right - left;
  const x = (index: number) => left + (points.length < 2 ? width / 2 : index * width / (points.length - 1));
  const rateY = (value: number) => 30 + (rateDomain[1] - value) * 150 / (rateDomain[1] - rateDomain[0]);
  const diffY = (value: number) => 30 + (diffDomain[1] - value) * 150 / (diffDomain[1] - diffDomain[0]);
  const rateTicks = [rateDomain[0], (rateDomain[0] + rateDomain[1]) / 2, rateDomain[1]];
  const barWidth = Math.min(18, width / Math.max(points.length, 1) * .65);
  const allDays = summary.exceeded + summary.met;
  return <article className="min-w-0 overflow-hidden rounded-[14px] border border-[#e2e7ef] bg-white text-[#24334c] print:break-inside-avoid" style={{ "--unit-accent": accents[unit] } as CSSProperties}>
    <header className="flex-wrap items-center justify-between gap-2 border-b border-b-[#edf0f5] px-[14px] py-3 [display:flex]"><div className="items-center gap-2.5 [display:flex]"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--unit-accent)_9%,white)] text-[12px] font-bold [color:var(--unit-accent)]">{unit === "plant" ? "NM" : unit.toUpperCase()}</span><div><h3 className="m-0 text-[16px] font-[650]">{title}</h3><p className="mx-0 mb-0 mt-1 text-[#768399] [font-size:11px]">{summary.total} ngày đủ dữ liệu so sánh</p></div></div><span className={`whitespace-nowrap rounded-[5px] px-2 py-[5px] font-[650] [font-size:10px] ${STATUS_TONE[tone]}`}>{hasComparison ? over ? "TB vượt PPA" : "TB đạt PPA" : "Chưa đủ dữ liệu"}</span></header>
    <div className="grid grid-cols-[1fr_1fr] gap-3 px-[14px] py-3 [&>div+div]:border-l [&>div+div]:border-l-[#edf0f5] [&>div+div]:pl-3"><div><p className={METRIC_P}>SHN thực tế <span className={METRIC_P_SPAN}>TB ngày</span></p><strong className={METRIC_VALUE}>{format(summary.avgActual)}</strong><span className={METRIC_UNIT}>kJ/kWh</span></div><div><p className={METRIC_P}>SHN theo PPA <span className={METRIC_P_SPAN}>TB ngày</span></p><strong className={METRIC_VALUE}>{format(summary.avgPpa)}</strong><span className={METRIC_UNIT}>kJ/kWh</span></div></div>
    <div className={`mx-[14px] my-0 items-center justify-between gap-3 rounded-[8px] px-3 py-[9px] [display:flex] ${SUMMARY_TONE[tone]}`}><div><p className="mx-0 mb-1 mt-0 [font-size:11px]">Chênh lệch trung bình</p><strong className="font-[650] tabular-nums [font-size:21px]">{hasComparison && summary.avgDiff! > 0 ? "+" : ""}{format(summary.avgDiff)} <small className="font-normal [font-size:10px]">kJ/kWh</small></strong></div><span className="[font-size:10px]">Thực tế − PPA</span></div>
    <div className="justify-between gap-3 px-[14px] pb-1.5 pt-2.5 text-[#64748b] [display:flex] [font-size:11px]"><span><i className="mr-[5px] inline-block h-[7px] w-[7px] rounded-[2px] bg-[#e58080]" />Vượt <b className="ml-1.5 font-[650] text-[#334155]">{summary.exceeded} ngày</b></span><span><i className="mr-[5px] inline-block h-[7px] w-[7px] rounded-[2px] bg-[#48a984]" />Đạt <b className="ml-1.5 font-[650] text-[#334155]">{summary.met} ngày</b></span></div>
    <div className="mx-[14px] mb-3 mt-0 h-1 overflow-hidden rounded-[3px] bg-[#f1f4f8] [display:flex]" aria-label={`${summary.exceeded} ngày vượt, ${summary.met} ngày đạt`}><span className="bg-[#e58080]" style={{ width: `${allDays ? summary.exceeded / allDays * 100 : 0}%` }} /><span className="bg-[#48a984]" style={{ width: `${allDays ? summary.met / allDays * 100 : 0}%` }} /></div>
    <div className="border-t border-t-[#edf0f5] px-2 pb-2 pt-3"><div className="items-baseline justify-between gap-2 px-1.5 py-0 [display:flex]"><h4 className="m-0 font-[650] [font-size:11px]">SHN & chênh lệch theo ngày</h4><span className="text-[#8a95a6] [font-size:9px]">kJ/kWh</span></div>{points.some(p => [p.thucTe, p.ppa, p.chenhLech].some(value => value !== null && Number.isFinite(value))) ? <svg className="mt-2.5 block h-auto w-full overflow-visible max-[1199px]:max-h-[240px] [&_text]:fill-[#768399] [&_text]:[font-family:inherit] [&_text]:[font-size:10px]" viewBox="0 0 500 212" role="img" aria-label={`Suất hao nhiệt ${title}: đường thực tế và PPA theo trục trái, cột chênh lệch theo trục phải; đỏ vượt, xanh đạt`}>
      <text x={left} y="14">SHN · trái</text><text x={right} y="14" textAnchor="end">CL · phải</text>
      {rateTicks.map((value, i) => <g key={i}><line x1={left} x2={right} y1={rateY(value)} y2={rateY(value)} className="stroke-[#e8edf4] [stroke-dasharray:3_4]" /><text x={left - 8} y={rateY(value) + 4} textAnchor="end">{tick.format(value)}</text></g>)}
      {[diffDomain[0], 0, diffDomain[1]].map(value => <text key={value} x={right + 8} y={diffY(value) + 4}>{tick.format(value)}</text>)}
      <line x1={left} x2={right} y1={diffY(0)} y2={diffY(0)} className="stroke-[#a5b1c2] [stroke-dasharray:4_3] [stroke-width:1]" />
      {points.map((p,i) => <g key={`diff-${p.date}-${i}`}>{p.chenhLech !== null && Number.isFinite(p.chenhLech) && <rect x={x(i) - barWidth / 2} y={Math.min(diffY(0),diffY(p.chenhLech))} width={barWidth} height={Math.max(1,Math.abs(diffY(0)-diffY(p.chenhLech)))} rx="2" fill={p.chenhLech > 0 ? "#e58080" : "#48a984"} fillOpacity=".45"><title>{`${p.date}: ${p.chenhLech > 0 ? "Vượt" : "Đạt"}, ${format(p.chenhLech)} kJ/kWh`}</title></rect>}{(i===0 || i===points.length-1 || (i % Math.max(1,Math.ceil(points.length/5))===0 && i < points.length-2)) && <text x={x(i)} y="204" textAnchor="middle">{p.date}</text>}</g>)}
      {buildRatePaths(points.map(p => p.ppa), x, rateY).map((d,i) => <path key={`ppa-${i}`} d={d} className="fill-none stroke-[#64748b] [stroke-dasharray:5_4] [stroke-width:1.7]" />)}
      {buildRatePaths(points.map(p => p.thucTe), x, rateY).map((d,i) => <path key={`actual-${i}`} d={d} className="fill-none [stroke-linejoin:round] [stroke-width:2.5] [stroke:var(--unit-accent)]" />)}
      {points.map((p,i) => <g key={`${p.date}-${i}`}>{p.thucTe !== null && Number.isFinite(p.thucTe) && <circle cx={x(i)} cy={rateY(p.thucTe)} r="3" fill="var(--unit-accent)"><title>{`${p.date}: Thực tế ${format(p.thucTe)} kJ/kWh`}</title></circle>}{p.ppa !== null && Number.isFinite(p.ppa) && <circle cx={x(i)} cy={rateY(p.ppa)} r="2.5" fill="#fff" stroke="#64748b"><title>{`${p.date}: PPA ${format(p.ppa)} kJ/kWh`}</title></circle>}</g>)}
    </svg> : <div className="grid min-h-[150px] place-items-center text-[12px] text-[#8a95a6]">Chưa có số liệu suất hao nhiệt</div>}<div className="flex-wrap justify-center gap-x-3 gap-y-2 px-0 py-1 text-[#64748b] [display:flex] [font-size:10px]"><span><i className={`${LEGEND_LINE} border-t-[color:var(--unit-accent)]`} />Thực tế</span><span><i className={`${LEGEND_LINE} border-t-[#64748b] [border-top-style:dashed]`} />PPA</span><span><i className={`${LEGEND_SWATCH} bg-[#e58080]`} />CL vượt</span><span><i className={`${LEGEND_SWATCH} bg-[#48a984]`} />CL đạt</span></div><p className="mx-0 mb-0 mt-1 text-center text-[#768399] [font-size:9px]">Hai trục co độc lập · CL = Thực tế − PPA</p></div>
    <details className="border-t border-t-[#edf0f5] px-[14px] py-2.5 text-[#52627a] [font-size:11px] print:hidden"><summary className="cursor-pointer focus-visible:[outline-offset:4px] focus-visible:[outline:2px_solid_var(--unit-accent)]">Xem số liệu biểu đồ</summary><div className="mt-3 max-h-[240px] overflow-auto"><table className="w-full min-w-[320px] border-collapse tabular-nums [&_:is(th,td)]:border-b [&_:is(th,td)]:border-b-[#edf0f5] [&_:is(th,td)]:px-1 [&_:is(th,td)]:py-[7px] [&_:is(th,td)]:text-right"><thead><tr><th>Ngày</th><th>Thực tế</th><th>PPA</th><th>Chênh lệch</th></tr></thead><tbody>{points.map((p,i)=><tr key={`${p.date}-${i}`}><td>{p.date}</td><td>{format(p.thucTe)}</td><td>{format(p.ppa)}</td><td>{format(p.chenhLech)}</td></tr>)}</tbody></table></div></details>
    <p className="m-0 px-[14px] pb-3 pt-0 leading-normal text-[#8a95a6] [font-size:9px]">TB: trung bình cộng ngày có đủ cặp số liệu. Khoảng trống: thiếu dữ liệu.</p>
  </article>;
}
