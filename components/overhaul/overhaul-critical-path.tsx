"use client";

import * as React from "react";
import { Download, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { milestoneDateLabel, type OverhaulMilestone } from "@/lib/overhaul-milestones";

const DAY = 86_400_000;
const CELL = 48;
const PAD = 140;
const BOX = 248;
const ROW = 110;
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
function lines(text: string) {
  const result: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!result.length || result[result.length - 1].length + word.length > 30) result.push(word);
    else result[result.length - 1] += ` ${word}`;
  }
  return result;
}

// Bố trí theo ngày thực; không suy diễn quan hệ phụ thuộc từ các ngoặc trong Excel.
function layout(items: OverhaulMilestone[]) {
  const first = Math.min(stamp("2026-10-07"), ...items.map((item) => stamp(item.startDate)));
  const last = Math.max(stamp("2026-12-05"), ...items.map((item) => stamp(item.endDate ?? item.startDate)));
  const days = Math.round((last - first) / DAY) + 1;
  const width = PAD * 2 + days * CELL;
  const x = (date: string) => PAD + (stamp(date) - first) / DAY * CELL + CELL / 2;
  const lanes: number[][] = [[], []];
  const nodes = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sortOrder - b.sortOrder).map((item) => {
    const range = Boolean(item.endDate && item.endDate !== item.startDate);
    const start = x(item.startDate), end = x(item.endDate ?? item.startDate);
    const left = Math.max(12, Math.min(width - BOX - 12, (start + end) / 2 - BOX / 2));
    const boundStart = Math.min(left, start), boundEnd = Math.max(left + BOX, end);
    const group = lanes[range ? 1 : 0];
    let lane = group.findIndex((right) => right + 20 < boundStart);
    if (lane < 0) lane = group.length;
    group[lane] = boundEnd;
    return { item, range, start, end, left, lane, text: lines(item.title) };
  });
  const row = Math.max(ROW, ...nodes.map((node) => node.text.length * 17 + 42));
  const axis = 110 + lanes[0].length * row;
  const height = axis + 98 + lanes[1].length * row + 60;
  return { nodes, first, days, width, height, axis, row, x };
}

export function OverhaulCriticalPath({ items, today, onSelect, open, onOpenChange }: { items: OverhaulMilestone[]; today: string; onSelect: (id: string) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  function changeOpen(value: boolean) { if (!value) setZoom(1); onOpenChange(value); }
  const [zoom, setZoom] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const chart = React.useMemo(() => layout(items), [items]);
  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      viewport.scrollTop = Math.max(0, chart.axis * zoom - viewport.clientHeight / 2);
      const index = Math.max(0, Math.min(chart.days - 1, (stamp(today) - chart.first) / DAY));
      viewport.scrollLeft = Math.max(0, (PAD + index * CELL) * zoom - viewport.clientWidth / 2);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, zoom, chart.axis, chart.days, chart.first, today]);
  async function download() {
    if (!svgRef.current) return;
    setExporting(true);
    let url: string | undefined;
    try {
      const svg = svgRef.current.cloneNode(true) as SVGSVGElement;
      svg.setAttribute("width", String(chart.width)); svg.setAttribute("height", String(chart.height));
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
      const image = new Image(); image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = chart.width * 2; canvas.height = chart.height * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không thể tạo ảnh");
      context.scale(2, 2); context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Không thể tạo ảnh");
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = pngUrl; link.download = "duong-gang-SCL-S2-DH1-2026.png"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    } catch { toast.error("Không tải được ảnh tiến độ. Vui lòng thử lại."); }
    finally { if (url) URL.revokeObjectURL(url); setExporting(false); }
  }
  function graphic(ref?: React.Ref<SVGSVGElement>, interactive = false) {
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${chart.width} ${chart.height}`} className="block h-auto w-full" role={interactive ? "group" : "img"} aria-label={`Sơ đồ đường găng SCL S2, ${items.length} nội dung kế hoạch`} style={{ fontFamily: "Arial, sans-serif" }}>
      <rect width={chart.width} height={chart.height} fill="#ffffff" />
      <rect width={chart.width} height="82" fill="#eaf3d9" />
      <text x={chart.width / 2} y="33" textAnchor="middle" fontSize="25" fontWeight="700" fill="#23421d">ĐƯỜNG GĂNG TIẾN ĐỘ ĐẠI TU S2-DH1</text>
      <text x={chart.width / 2} y="61" textAnchor="middle" fontSize="17" fill="#46623f">{milestoneDateLabel(new Date(chart.first).toISOString().slice(0, 10))} – {milestoneDateLabel(new Date(chart.first + (chart.days - 1) * DAY).toISOString().slice(0, 10))} · KẾ HOẠCH</text>
      {Array.from({ length: chart.days }, (_, index) => {
        const date = new Date(chart.first + index * DAY), iso = date.toISOString().slice(0, 10);
        const left = PAD + index * CELL;
        const hasPoint = chart.nodes.some((node) => !node.range && node.item.startDate === iso);
        return <g key={iso}>
          {date.getUTCDay() === 0 && <rect x={left} y="82" width={CELL} height={chart.height - 82} fill="#f8faf0" />}
          <line x1={left} x2={left} y1="82" y2={chart.height - 40} stroke="#e2e8f0" />
          <rect x={left} y={chart.axis} width={CELL} height="38" fill={hasPoint ? "#dc4444" : "#edf4f9"} stroke="#cbd5e1" />
          <text x={left + CELL / 2} y={chart.axis + 25} textAnchor="middle" fontSize="16" fontWeight="700" fill={hasPoint ? "#fff" : "#183b56"}>{index + 1}</text>
          <text x={left + CELL / 2} y={chart.axis + 62} textAnchor="middle" fontSize="15" fill="#334155">{date.getUTCDate()}/{date.getUTCMonth() + 1}</text>
          <text x={left + CELL / 2} y={chart.axis + 83} textAnchor="middle" fontSize="12" fill="#64748b">{["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getUTCDay()]}</text>
        </g>;
      })}
      <text x="20" y={chart.axis + 25} fontSize="16" fontWeight="700" fill="#183b56">Ngày đại tu</text>
      <text x="20" y={chart.axis + 62} fontSize="16" fill="#334155">Ngày lịch</text>
      {chart.nodes.map((node) => {
        const y = node.range ? chart.axis + 110 + node.lane * chart.row : chart.axis - (node.lane + 1) * chart.row;
        const boxHeight = node.text.length * 17 + 38;
        return <g key={node.item.id} data-milestone-id={node.item.id} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `Xem mốc ${node.item.title}` : undefined} style={{ cursor: interactive ? "pointer" : undefined }} onClick={interactive ? () => { changeOpen(false); onSelect(node.item.id); } : undefined} onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); changeOpen(false); onSelect(node.item.id); } } : undefined}>
          <title>{node.item.title} · {milestoneDateLabel(node.item.startDate)}{node.range ? ` – ${milestoneDateLabel(node.item.endDate!)}` : ""}</title>
          {node.range ? <>
            <line x1={node.start} x2={node.end} y1={y + boxHeight + 9} y2={y + boxHeight + 9} stroke="#3b82a0" strokeWidth="5" />
            {[node.start, node.end].map((x, i) => <line key={i} x1={x} x2={x} y1={y + boxHeight + 2} y2={y + boxHeight + 16} stroke="#3b82a0" strokeWidth="3" />)}
          </> : <>
            <path d={`M ${node.left + BOX / 2} ${y + boxHeight} L ${node.start} ${chart.axis - 10}`} fill="none" stroke="#d65a4a" strokeWidth="1.6" />
            <path d={`M ${node.start - 5} ${chart.axis - 10} L ${node.start} ${chart.axis - 2} L ${node.start + 5} ${chart.axis - 10}`} fill="#d65a4a" />
          </>}
          <rect x={node.left} y={y} width={BOX} height={boxHeight} rx="6" fill={node.range ? "#edf6fa" : "#fff7f3"} stroke={node.range ? "#65a3bc" : "#dc7660"} strokeWidth="1.5" />
          <text x={node.left + BOX / 2} y={y + 21} textAnchor="middle" fontSize="14" fontWeight="700" fill="#193b52">{node.text.map((line, i) => <tspan key={i} x={node.left + BOX / 2} dy={i ? 17 : 0}>{line}</tspan>)}</text>
          <text x={node.left + BOX / 2} y={y + boxHeight - 10} textAnchor="middle" fontSize="12" fill="#64748b">{node.item.startDate.slice(8)}/{node.item.startDate.slice(5, 7)}{node.range ? ` – ${node.item.endDate!.slice(8)}/${node.item.endDate!.slice(5, 7)}` : ""}</text>
        </g>;
      })}
      {stamp(today) >= chart.first && stamp(today) <= chart.first + (chart.days - 1) * DAY && <g pointerEvents="none"><line x1={chart.x(today)} x2={chart.x(today)} y1="82" y2={chart.height - 35} stroke="#d97706" strokeDasharray="7 5" strokeWidth="2" /><text x={chart.x(today) + 6} y="101" fontSize="14" fontWeight="700" fill="#b45309">Hôm nay</text></g>}
      <text x="20" y={chart.height - 16} fontSize="14" fill="#64748b">Ô đỏ: mốc theo ngày · Thanh xanh: khoảng công việc theo kế hoạch · Không thể hiện kết quả thực hiện</text>
    </svg>;
  }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="flex h-[calc(100dvh-1rem)] max-h-none w-[calc(100vw-1rem)] max-w-[1680px] flex-col gap-3 overflow-hidden p-3 sm:h-[94dvh] sm:w-[92vw] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <DialogHeader className="min-w-0 pr-8 lg:pr-0"><DialogTitle>Đường găng tiến độ đại tu S2-DH1</DialogTitle><DialogDescription>Kéo ngang và dọc để đọc toàn bộ sơ đồ. Các ngày thể hiện kế hoạch.</DialogDescription></DialogHeader>
      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end lg:pr-8"><Button variant="outline" size="icon" className="h-10 w-10" aria-label="Thu nhỏ sơ đồ" disabled={zoom <= 0.5} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}><Minus className="h-4 w-4" /></Button><span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span><Button variant="outline" size="icon" className="h-10 w-10" aria-label="Phóng lớn sơ đồ" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + 0.25))}><Plus className="h-4 w-4" /></Button><Button variant="outline" className="h-10" onClick={() => setZoom(0.5)}>Xem tổng thể</Button><Button variant="outline" className="h-10 gap-2" disabled={exporting} onClick={download}><Download className="h-4 w-4" />{exporting ? "Đang tạo ảnh…" : "Tải ảnh PNG"}</Button></div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-lg border bg-white" data-critical-path-scroll><div style={{ width: chart.width * zoom }}>{graphic(svgRef, true)}</div></div>
    </DialogContent></Dialog>;
}
