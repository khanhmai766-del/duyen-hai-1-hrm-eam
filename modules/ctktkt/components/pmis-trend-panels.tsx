import { buildRatePaths } from "@/modules/ctktkt/lib/ppa-chart-layout";
import { pmisTrendDomain } from "@/modules/ctktkt/lib/pmis-trend-domain";
import "./pmis-trend-panels.css";

type Metric = { key:string; label:string; unit:string };
type Point = { date:string; values:Record<string,number|null> };
type Series = { unit:"s1"|"s2"; points:Point[] };
const format = new Intl.NumberFormat("vi-VN",{minimumFractionDigits:2,maximumFractionDigits:2});
const axisFormat = new Intl.NumberFormat("vi-VN",{maximumFractionDigits:3});
const shortDate=(date:string)=>date.split("-").reverse().slice(0,2).join("/");
export function PmisTrendPanels({metrics,series}:{metrics:Metric[];series:Series[]}) {
  const domains=Object.fromEntries(metrics.map(metric=>[metric.key,pmisTrendDomain(series.flatMap(s=>s.points.map(p=>p.values[metric.key]??null)))]));
  return <div className="pmis-trend-grid">{series.map(({unit,points})=><article key={unit} className={`pmis-trend-panel ${unit}`}>
    <header><span className="pmis-unit-tag">{unit.toUpperCase()}</span><div><h3>Tổ máy {unit.toUpperCase()} · Duyên Hải 1</h3><p>{points.length} ngày trong khoảng xem</p></div></header>
    {metrics.map(metric=>{
      const values=points.map(p=>p.values[metric.key]??null);
      const latest=points.findLast(p=>p.values[metric.key]!==null && p.values[metric.key]!==undefined && Number.isFinite(p.values[metric.key]));
      const valid=values.filter(v=>v!==null && Number.isFinite(v)).length;
      const [min,max]=domains[metric.key];
      const x=(i:number)=>56+(points.length<2?197:i*394/(points.length-1));
      const y=(v:number)=>14+(max-v)*72/(max-min);
      return <section key={metric.key} className="pmis-metric-trend"><div className="pmis-metric-heading"><div><h4>{metric.label}</h4><p>{metric.unit} · {valid}/{points.length} ngày có dữ liệu</p></div><div className="pmis-latest-value"><strong>{latest?format.format(latest.values[metric.key]!):"—"}</strong><span>{latest?`Gần nhất · ${shortDate(latest.date)}`:"Chưa có số liệu"}</span></div></div>
        {valid>0?<svg viewBox="0 0 470 113" role="img" aria-label={`${metric.label} ${unit.toUpperCase()}, đơn vị ${metric.unit}`}>
          {[min,(min+max)/2,max].map((v,i)=><g key={i}><line x1="56" x2="450" y1={y(v)} y2={y(v)} className="pmis-trend-gridline"/><text x="48" y={y(v)+3} textAnchor="end">{axisFormat.format(v)}</text></g>)}
          {buildRatePaths(values,x,y).map((d,i)=><path key={i} d={d} className="pmis-trend-path"/>)}
          {values.map((v,i)=><g key={i}>{v!==null && Number.isFinite(v) && <circle cx={x(i)} cy={y(v)} r="2.6" className="pmis-trend-point"><title>{`${shortDate(points[i].date)}: ${format.format(v)} ${metric.unit}`}</title></circle>}{(i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/5))===0)&&<text x={x(i)} y="107" textAnchor="middle">{shortDate(points[i].date)}</text>}</g>)}
        </svg>:<div className="pmis-trend-empty">Không có dữ liệu trong khoảng ngày đã chọn</div>}
      </section>;
    })}
    <footer>Cùng chỉ tiêu dùng cùng thang đo S1/S2. Khoảng trống là ngày thiếu dữ liệu.</footer>
  </article>)}</div>;
}
