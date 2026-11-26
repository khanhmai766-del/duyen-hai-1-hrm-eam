/** Ảnh "Copy bảng + trend" của TBNT theo ca (chuyển từ reportCanvas trong tbnt-shift.js của VibraControl cũ). */
import type { CellLevel } from "@/lib/vibration/severity";
import { displayDate, wrapText } from "./export-core";

export interface TbntCanvasRow {
  name: string;
  time: string;
  note: string;
  /** 2 hàng (Động cơ, Bơm) × 6 ô (NDE X, Y, nhiệt độ; DE X, Y, nhiệt độ). */
  cells: { t: string; level: CellLevel }[][];
  status: string;
  statusLevel: string;
}
export interface TbntTrendPoint {
  date: string;
  v: number;
  where: string;
}
export interface TbntCanvasInput {
  date: string;
  shiftLabel: string;
  shiftHours: string;
  person: string;
  rows: TbntCanvasRow[];
  /** Mỗi bơm một chuỗi 30 ngày (vận tốc lớn nhất mỗi ngày). */
  series: TbntTrendPoint[][];
  /** Giới hạn Wowk Bảng 1 (mm/s) thấp nhất trong các bơm, hoặc null. */
  limit: number | null;
}

const TREND_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#8e5bd8", "#d23b8f", "#6b7c8a"];
const fmt2 = (v: number) => String(Number(v.toFixed(2)));
const dm = (d: string) => displayDate(d).slice(0, 5);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function niceStep(range: number) {
  const raw = range / 5;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function tbntCanvas(input: TbntCanvasInput, names: string[]): HTMLCanvasElement {
  const { date, rows: inRows, series, limit } = input;
  const F = '"Times New Roman",Times,serif';
  const P = 20, PAD = 8, LH = 18, NCR = 6, NRT = 2;
  const W = [150, 62, 80, ...Array(NCR).fill(72), 170, 210] as number[];
  const TW = W.reduce((a, b) => a + b, 0);
  const X = [0];
  W.forEach((w, i) => X.push(X[i] + w));
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const rows = inRows.map((r) => {
    ctx.font = `13px ${F}`;
    const lines = Math.max(wrapText(ctx, r.note, W[3 + NCR] - PAD * 2).length, wrapText(ctx, r.status, W[4 + NCR] - PAD * 2).length, wrapText(ctx, r.name, W[0] - PAD * 2).length);
    return { ...r, h: Math.max(64, lines * LH + PAD * 2) };
  });
  const days = Array.from({ length: 30 }, (_, i) => addDays(date, i - 29));
  const notes = names.map((name, k) => {
    const s = series[k] ?? [];
    const mx = s.reduce<TbntTrendPoint | null>((a, b) => (!a || b.v > a.v ? b : a), null);
    const last = s.at(-1);
    const tr = s.length >= 2 ? (last!.v > s[0].v * 1.25 ? " · xu hướng tăng" : last!.v < s[0].v * 0.8 ? " · xu hướng giảm" : " · ổn định") : "";
    return `${name}: ${mx ? `lớn nhất tháng ${fmt2(mx.v)} mm/s (${mx.where}, ${dm(mx.date)})` : "chưa có số đo trong tháng"}${last ? ` · lần cuối ${dm(last.date)}: ${fmt2(last.v)} mm/s (${last.where})` : ""}${tr} · Theo dõi (Wowk): ${rows[k]?.status.replace("\n", " · ") ?? ""}`;
  });
  ctx.font = `14px ${F}`;
  const noteLines = notes.map((n) => wrapText(ctx, n, TW - 40));
  const hH = 52;
  const tableH = hH + rows.reduce((n, r) => n + r.h, 0);
  const chartH = 330;
  const legendH = noteLines.reduce((n, l) => n + l.length * LH + 6, 0) + 16;
  const H = P + 56 + tableH + 28 + 30 + chartH + legendH + P;
  cv.width = TW + 2 * P;
  cv.height = H;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, H);
  ctx.textBaseline = "top";
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  const fill: Record<string, string> = { rise: "#ffe69a", over: "#ffb9be" };
  const stFill: Record<string, string> = { watch: "#fff4d6", plan: "#ffe9c7", soon: "#ffd6d6", stop: "#ffc4c4" };
  const cell = (x: number, y: number, w: number, h: number, text: string, o: { bg?: string; bold?: boolean; size?: number; align?: CanvasTextAlign } = {}) => {
    const { bg, bold, size = 14, align = "center" } = o;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeStyle = "#555";
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = "#000";
    ctx.font = `${bold ? "bold " : ""}${size}px ${F}`;
    const ls = wrapText(ctx, text, w - PAD * 2);
    const y0 = y + (h - ls.length * LH) / 2 + 2;
    ctx.textAlign = align;
    ls.forEach((l, k) => ctx.fillText(l, align === "left" ? x + PAD : x + w / 2, y0 + k * LH));
  };
  let y = P;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.font = `bold 20px ${F}`;
  ctx.fillText("BẢNG THÔNG SỐ ĐỘ RUNG TRẠM BƠM NƯỚC THÔ", P + TW / 2, y);
  ctx.font = `bold 16px ${F}`;
  ctx.fillText(`${input.shiftLabel} ${input.shiftHours} · ngày ${displayDate(date)}${input.person ? ` · Người đo: ${input.person}` : ""}`, P + TW / 2, y + 27);
  y += 56;
  const sides = ["NDE", "NDE", "NDE", "DE", "DE", "DE"];
  const subs: [string, string][] = [["X", "mm/s"], ["Y", "mm/s"], ["Nhiệt độ", "°C"], ["X", "mm/s"], ["Y", "mm/s"], ["Nhiệt độ", "°C"]];
  ["Tên bơm", "Điểm đo", "Giờ đo", ...subs.map(([l, u], j) => `${sides[j]} · ${l}\n(${u})`), "Nhận xét", "Theo dõi (Wowk)"].forEach((t, i) =>
    cell(P + X[i], y, W[i], hH, t, { bg: "#e8eef2", bold: true, size: 13 })
  );
  y += hH;
  const MACH = ["Động cơ", "Bơm"];
  for (const r of rows) {
    const h2 = r.h / NRT;
    cell(P + X[0], y, W[0], r.h, r.name, { bold: true });
    MACH.forEach((m, q) => cell(P + X[1], y + q * h2, W[1], h2, m, { size: 13 }));
    cell(P + X[2], y, W[2], r.h, r.time);
    r.cells.forEach((cs, j) => cs.forEach((c, i) => cell(P + X[3 + i], y + j * h2, W[3 + i], h2, c.t, { bg: fill[c.level] })));
    cell(P + X[3 + NCR], y, W[3 + NCR], r.h, r.note, { align: "left", size: 13 });
    cell(P + X[4 + NCR], y, W[4 + NCR], r.h, r.status, { bg: stFill[r.statusLevel], size: 13 });
    y += r.h;
  }
  ctx.textAlign = "left";
  ctx.font = `12.5px ${F}`;
  ctx.fillStyle = "#333";
  ctx.fillText("Ô vàng: tăng ≥ 25 % so với lần đo trước · Ô đỏ: vận tốc > 5 mm/s (như Mill theo ca) · Theo dõi: Wowk tại gối rung cao nhất.", P, y + 8);
  y += 28;
  // ---- Trend 30 ngày ----
  ctx.font = `bold 16px ${F}`;
  ctx.fillStyle = "#000";
  ctx.fillText(`XU HƯỚNG ĐỘ RUNG LỚN NHẤT MỖI BƠM — 30 NGÀY (${dm(days[0])} → ${displayDate(date)})`, P, y);
  y += 30;
  const L = P + 52, R = P + TW - 10, T = y + 8, B = y + chartH - 40;
  const all = series.flat().map((p) => p.v).concat(limit ? [limit] : []);
  const vmax = Math.max(1, ...all) * 1.12;
  const step = niceStep(vmax);
  const top = Math.ceil(vmax / step) * step;
  const xOf = (i: number) => L + ((R - L) * i) / 29;
  const yOf = (v: number) => B - ((B - T) * v) / top;
  ctx.strokeStyle = "#d5dde3";
  ctx.fillStyle = "#444";
  ctx.font = `12px ${F}`;
  ctx.textAlign = "right";
  for (let v = 0; v <= top + 1e-9; v += step) {
    const yy = yOf(v);
    ctx.beginPath();
    ctx.moveTo(L, yy + 0.5);
    ctx.lineTo(R, yy + 0.5);
    ctx.stroke();
    ctx.fillText(fmt2(v), L - 6, yy - 7);
  }
  ctx.save();
  ctx.translate(P + 8, (T + B) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("mm/s", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  days.forEach((d, i) => {
    if (i % 3 === 2 || i === 29) ctx.fillText(dm(d), xOf(i), B + 8);
  });
  ctx.strokeStyle = "#888";
  ctx.beginPath();
  ctx.moveTo(L, T);
  ctx.lineTo(L, B + 0.5);
  ctx.lineTo(R, B + 0.5);
  ctx.stroke();
  if (limit) {
    const yy = yOf(limit);
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = "#c53030";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(L, yy);
    ctx.lineTo(R, yy);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#c53030";
    ctx.textAlign = "right";
    ctx.fillText(`Giới hạn Wowk Bảng 1: ${fmt2(limit)} mm/s`, R, yy - 16);
  }
  series.forEach((s, k) => {
    const c = TREND_COLORS[k % TREND_COLORS.length];
    const pts = s.map((p) => [xOf(days.indexOf(p.date)), yOf(p.v)] as [number, number]).filter(([x]) => x >= L);
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
    ctx.stroke();
    pts.forEach(([x, yy]) => {
      ctx.beginPath();
      ctx.arc(x, yy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    const last = pts.at(-1);
    if (last) {
      ctx.font = `bold 12px ${F}`;
      ctx.textAlign = "left";
      ctx.fillText(fmt2(s.at(-1)!.v), Math.min(last[0] + 6, R - 24), last[1] - 14);
    }
  });
  ctx.lineWidth = 1;
  y += chartH;
  ctx.textAlign = "left";
  ctx.font = `14px ${F}`;
  noteLines.forEach((ls, k) => {
    ctx.fillStyle = TREND_COLORS[k % TREND_COLORS.length];
    ctx.fillRect(P, y + 6, 22, 4);
    ctx.fillStyle = "#000";
    ls.forEach((l, j) => ctx.fillText(l, P + 30, y + j * LH));
    y += ls.length * LH + 6;
  });
  return cv;
}
