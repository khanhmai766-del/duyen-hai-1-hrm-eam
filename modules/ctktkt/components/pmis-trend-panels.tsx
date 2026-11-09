import { buildRatePaths } from "@/modules/ctktkt/lib/ppa-chart-layout";
import { pmisTrendDomain } from "@/modules/ctktkt/lib/pmis-trend-domain";

type Metric = { key:string; label:string; unit:string };
type Point = { date:string; values:Record<string,number|null> };
type Series = { unit:"s1"|"s2"; points:Point[] };
const format = new Intl.NumberFormat("vi-VN",{minimumFractionDigits:2,maximumFractionDigits:2});
const axisFormat = new Intl.NumberFormat("vi-VN",{maximumFractionDigits:3});
const shortDate=(date:string)=>date.split("-").reverse().slice(0,2).join("/");
export function PmisTrendPanels({metrics,series}:{metrics:Metric[];series:Series[]}) {
  const domains=Object.fromEntries(metrics.map(metric=>[metric.key,pmisTrendDomain(series.flatMap(s=>s.points.map(p=>p.values[metric.key]??null)))]));
  return <div className="grid grid-cols-2 gap-5 max-md:grid-cols-[1fr] print:grid-cols-2">{series.map(({unit,points})=><article key={unit} className={`${unit==="s2"?"[--pmis-unit:#b77914]":"[--pmis-unit:#2563eb]"} min-w-0 overflow-hidden rounded-[14px] border border-[#e2e7ef] bg-white`}>
    <header className="items-center gap-3 [display:flex] border-b border-b-[#edf0f5] p-5"><span className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--pmis-unit)_9%,white)] text-[12px] font-bold [color:var(--pmis-unit)]">{unit.toUpperCase()}</span><div><h3 className="m-0 text-[16px] font-[650] text-[#24334c]">Tổ máy {unit.toUpperCase()} · Duyên Hải 1</h3><p className="mx-0 mb-0 mt-1 text-[#768399] [font-size:11px]">{points.length} ngày trong khoảng xem</p></div></header>
    {metrics.map(metric=>{
      const values=points.map(p=>p.values[metric.key]??null);
      const latest=points.findLast(p=>p.values[metric.key]!==null && p.values[metric.key]!==undefined && Number.isFinite(p.values[metric.key]));
      const valid=values.filter(v=>v!==null && Number.isFinite(v)).length;
      const [min,max]=domains[metric.key];
      const x=(i:number)=>56+(points.length<2?197:i*394/(points.length-1));
      const y=(v:number)=>14+(max-v)*72/(max-min);
      return <section key={metric.key} className="border-b border-b-[#edf0f5] px-5 py-4 max-md:p-4 print:break-inside-avoid"><div className="justify-between gap-3 [align-items:start] [display:flex]"><div><h4 className="m-0 text-[12px] font-semibold text-[#334155] max-md:max-w-[210px]">{metric.label}</h4><p className="mx-0 mb-0 mt-[5px] text-[#768399] [font-size:10px]">{metric.unit} · {valid}/{points.length} ngày có dữ liệu</p></div><div className="shrink-0 text-right"><strong className="block text-[19px] font-[650] tabular-nums tracking-[-.02em] [color:var(--pmis-unit)]">{latest?format.format(latest.values[metric.key]!):"—"}</strong><span className="mt-[3px] block text-[#8a95a6] [font-size:9px]">{latest?`Gần nhất · ${shortDate(latest.date)}`:"Chưa có số liệu"}</span></div></div>
        {valid>0?<svg className="mt-3 block h-auto max-h-[155px] w-full overflow-visible [&_text]:fill-[#768399] [&_text]:[font-size:9px] [&_text]:[font-family:inherit]" viewBox="0 0 470 113" role="img" aria-label={`${metric.label} ${unit.toUpperCase()}, đơn vị ${metric.unit}`}>
          {[min,(min+max)/2,max].map((v,i)=><g key={i}><line x1="56" x2="450" y1={y(v)} y2={y(v)} className="stroke-[#e8edf4] [stroke-dasharray:3_4]"/><text x="48" y={y(v)+3} textAnchor="end">{axisFormat.format(v)}</text></g>)}
          {buildRatePaths(values,x,y).map((d,i)=><path key={i} d={d} className="fill-none stroke-2 [stroke-linejoin:round] [stroke:var(--pmis-unit)]"/>)}
          {values.map((v,i)=><g key={i}>{v!==null && Number.isFinite(v) && <circle cx={x(i)} cy={y(v)} r="2.6" className="[fill:var(--pmis-unit)]"><title>{`${shortDate(points[i].date)}: ${format.format(v)} ${metric.unit}`}</title></circle>}{(i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/5))===0)&&<text x={x(i)} y="107" textAnchor="middle">{shortDate(points[i].date)}</text>}</g>)}
        </svg>:<div className="mt-3 grid aspect-[470/113] max-h-[155px] min-h-0 w-full place-items-center text-[#8a95a6] [font-size:11px]">Không có dữ liệu trong khoảng ngày đã chọn</div>}
      </section>;
    })}
    <footer className="px-5 py-[14px] leading-normal [font-size:10px] text-[#8a95a6]">Cùng chỉ tiêu dùng cùng thang đo S1/S2. Khoảng trống là ngày thiếu dữ liệu.</footer>
  </article>)}</div>;
}
