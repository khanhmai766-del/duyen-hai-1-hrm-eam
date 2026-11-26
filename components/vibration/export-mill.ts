/** Báo cáo MILL theo ca: Excel / PDF / ảnh "Copy bảng thông số" (chuyển từ mill-shift-report.js + mill-analysis.js của VibraControl cũ). */
import { SHIFT_WINDOWS, type ShiftId } from "@/lib/vibration/constants";
import { cellNumber } from "@/lib/vibration/parse";
import { fixedCellLevel } from "@/lib/vibration/severity";
import type { VibrationRecordDto } from "@/lib/vibration/types";
import { buildWorkbookFiles, displayDate, htmlEsc, sheetName, wrapText, xmlEsc, zipFiles, colLetter } from "./export-core";
import { keyKind, MILL_AXES, MILL_BEARINGS } from "./mill-utils";

export interface MillExportItem {
  device: { name: string; area: string };
  /** b1vX…b6dZ, b1t…b6t, gearSmall, gearRing, oil (số hoặc null) + các trường mô tả. */
  data: Record<string, number | null>;
  meta: { shift: ShiftId; note: string; time: string; actualDate: string; person: string };
  /** Số lần đo ca trước của cùng máy (để tô vàng). */
  prev: Record<string, unknown>;
  /** Hai cột thêm của ảnh Copy: xu hướng + khuyến cáo. */
  assess?: [string, string];
}
export interface MillGroup {
  area: string;
  items: MillExportItem[];
}

const axes = MILL_AXES;
const num = (v: unknown) => cellNumber(v);

/** Danh sách trường (23 + 3 ô) và nhãn, đúng thứ tự cũ. */
export function millSchema() {
  const fields: { key: string; label: string }[] = [];
  for (const b of MILL_BEARINGS) {
    for (const a of axes) fields.push({ key: `b${b}v${a}`, label: `Gối #${b} độ rung ${a} (mm/s)` });
    for (const a of axes) fields.push({ key: `b${b}d${a}`, label: `Gối #${b} biên độ ${a} (µm)` });
    fields.push({ key: `b${b}t`, label: `Gối #${b} nhiệt độ (°C)` });
  }
  fields.push({ key: "gearSmall", label: "Nhiệt độ bánh răng nhỏ (°C)" }, { key: "gearRing", label: "Nhiệt độ vành răng lớn (°C)" }, { key: "oil", label: "Tiêu hao dầu VRL trong ngày (cm)" });
  return fields;
}

const triple = (r: MillExportItem["data"], b: number, k: "v" | "d") => {
  const values = axes.map((a) => num(r[`b${b}${k}${a}`]));
  return values.some((v) => v !== null) ? values.map((v) => (v === null ? "—" : v)).join("/") : "";
};
const bearing = (r: MillExportItem["data"], b: number) => {
  const v = triple(r, b, "v");
  const d = triple(r, b, "d");
  return !v && !d ? "" : `${v || "—/—/—"}\n${d || "—/—/—"}`;
};
const shortName = (name: string) => name.replace(/^Máy nghiền /, "");
const noteText = (it: MillExportItem) =>
  [it.meta.note, SHIFT_WINDOWS[it.meta.shift].label, [it.meta.actualDate ? displayDate(it.meta.actualDate) : "", it.meta.time].filter(Boolean).join(" "), it.meta.person ? `Người đo: ${it.meta.person}` : ""]
    .filter(Boolean)
    .join("\n");

const heading = ["Gối đỡ\nMáy nghiền", "Thông số", ...Array.from({ length: 6 }, (_, i) => `#${i + 1}`), "Nhiệt độ bánh răng nhỏ\n(°C)", "Nhiệt độ vành răng lớn\n(°C)", "Dầu VRL tiêu hao/ngày\n(cm)", "GHI CHÚ"];
const widths = [18, 16, 17, 17, 17, 17, 17, 17, 17, 17, 18, 36];
export const millTitle = (area: string, date: string, scope: string) => `SỔ THEO DÕI ĐỘ RUNG VÀ NHIỆT ĐỘ ${area.toLocaleUpperCase("vi")} - DH1\nNgày ca ${displayDate(date)} · ${scope}`;
const warningLegend = "Đỏ: vận tốc > 5 mm/s hoặc biên độ > 50 µm. Vàng: tăng ≥ 25% so với lần đo trước. Ô gộp lấy mức cao nhất; đỏ ưu tiên vàng.";

/** 5 = đỏ (vượt mức), 4 = vàng (tăng ≥ 25%), 0 = bình thường. */
function warningStyles(it: MillExportItem) {
  const level = (k: string) => {
    const l = fixedCellLevel(keyKind(k), num(it.data[k]), num(it.prev[k]));
    return l === "over" ? 5 : l === "rise" ? 4 : 0;
  };
  return {
    bearings: Array.from({ length: 6 }, (_, i) => Math.max(...(["v", "d"] as const).flatMap((k) => axes.map((a) => level(`b${i + 1}${k}${a}`))))),
    temps: Array.from({ length: 6 }, (_, i) => level(`b${i + 1}t`)),
    extras: ["gearSmall", "gearRing", "oil"].map(level),
  };
}

function sheetXml(group: MillGroup, date: string, scope: string) {
  const merges = ["A1:L1", ...Array.from({ length: 12 }, (_, i) => `${colLetter(i + 1)}2:${colLetter(i + 1)}3`)];
  const rows: string[] = [];
  const cell = (n: number, c: number, v: unknown, s = 0) => {
    const ref = colLetter(c) + n;
    if (v === null || v === undefined || v === "") return `<c r="${ref}" s="${s}"/>`;
    return typeof v === "number" ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const row = (n: number, vals: unknown[], s: number | number[], h: number) =>
    `<row r="${n}" ht="${h}" customHeight="1">${vals.map((v, i) => cell(n, i + 1, v, Array.isArray(s) ? s[i] || 0 : s)).join("")}</row>`;
  rows.push(row(1, [millTitle(group.area, date, scope)], 2, 44), row(2, heading, 1, 52), row(3, [], 1, 16));
  group.items.forEach((it, i) => {
    const n = 4 + i * 2;
    const w = warningStyles(it);
    const r = it.data;
    for (const c of ["A", "I", "J", "K", "L"]) merges.push(`${c}${n}:${c}${n + 1}`);
    rows.push(
      row(n, [shortName(it.device.name), "Độ rung\n(mm/s; µm)", ...Array.from({ length: 6 }, (_, j) => bearing(r, j + 1)), num(r.gearSmall), num(r.gearRing), num(r.oil), noteText(it)], [0, 0, ...w.bearings, ...w.extras, 0], 58),
      row(n + 1, ["", "Nhiệt độ\n(°C)", ...Array.from({ length: 6 }, (_, j) => num(r[`b${j + 1}t`]))], [0, 0, ...w.temps], 34)
    );
  });
  const end = 4 + group.items.length * 2;
  merges.push(`A${end}:L${end}`);
  rows.push(row(end, [`X/Y/Z theo thứ tự; dòng trên mm/s, dòng dưới µm. Ô trống hoặc —: chưa đo. ${warningLegend}`], 3, 40));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.2" right="0.2" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup orientation="landscape" paperSize="8" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}

const STYLES = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="14"/><name val="Times New Roman"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE69A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFB9BE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border><border><left/><right/><top/><bottom/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="6"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function millWorkbook(groups: MillGroup[], date: string, scope: string): Blob {
  return zipFiles(buildWorkbookFiles(groups.map((g) => sheetName(g.area)), STYLES, groups.map((g) => sheetXml(g, date, scope)), false));
}

export function millPdfHtml(groups: MillGroup[], date: string, scope: string): string {
  const cls = (n: number) => (n === 5 ? "warn-red" : n === 4 ? "warn-yellow" : "");
  const total = widths.reduce((a, b) => a + b, 0);
  const body = groups
    .map(
      (g) =>
        `<section><h1>${htmlEsc(millTitle(g.area, date, scope))}</h1><table><colgroup>${widths.map((w) => `<col style="width:${(100 * w) / total}%">`).join("")}</colgroup><thead><tr>${heading.map((h) => `<th>${htmlEsc(h)}</th>`).join("")}</tr></thead>${g.items
          .map((it) => {
            const w = warningStyles(it);
            const r = it.data;
            return `<tbody><tr><th rowspan="2">${htmlEsc(shortName(it.device.name))}</th><td>Độ rung\n(mm/s; µm)</td>${Array.from({ length: 6 }, (_, i) => `<td class="${cls(w.bearings[i])}">${htmlEsc(bearing(r, i + 1))}</td>`).join("")}${["gearSmall", "gearRing", "oil"].map((k, i) => `<td class="${cls(w.extras[i])}" rowspan="2">${htmlEsc(num(r[k]) ?? "")}</td>`).join("")}<td rowspan="2">${htmlEsc(noteText(it))}</td></tr><tr><td>Nhiệt độ\n(°C)</td>${Array.from({ length: 6 }, (_, i) => `<td class="${cls(w.temps[i])}">${htmlEsc(num(r[`b${i + 1}t`]) ?? "")}</td>`).join("")}</tr></tbody>`;
          })
          .join("")}</table><p><small>X/Y/Z theo thứ tự; dòng trên mm/s, dòng dưới µm. Ô trống hoặc —: chưa đo. ${htmlEsc(warningLegend)}</small></p></section>`
    )
    .join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bảng đo máy nghiền ${displayDate(date)}</title><style>@page{size:A3 landscape;margin:10mm}body{font:12pt 'Times New Roman',serif}section{break-after:page}section:last-child{break-after:auto}h1{font-size:16pt;text-align:center;white-space:pre-line}table{border-collapse:collapse;table-layout:fixed;width:100%}th,td{border:1px solid #555;text-align:center;padding:6px;white-space:pre-line;overflow-wrap:anywhere}th{background:#e8eef2}tbody{break-inside:avoid}small{font-size:10pt}.warn-yellow{background:#ffe69a!important}.warn-red{background:#ffb9be!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${body}</body></html>`;
}

// ---- Xu hướng + khuyến cáo (đơn giản hoá từ MillAnalysis.assessment) ----
// Bản cũ dùng thông số máy trong danh mục để chọn nhóm ISO 20816-3 / bệ cứng-mềm. Bản này chưa có thông số máy nên dùng
// ngưỡng Nhóm 1 (SCCN) lấy mức khắt khe (bệ cứng): A ≤ 2.3, B ≤ 4.5, C ≤ 7.1, D > 7.1 mm/s RMS — chỉ để sàng lọc.
const STOPPED_RE = /máy dự phòng|ngừng sửa chữa|máy không vận hành|máy ngừng|máy dừng/i;
const zoneOf = (v: number | null) => (v == null ? "—" : v <= 2.3 ? "A" : v <= 4.5 ? "B" : v <= 7.1 ? "C" : "D");
const r2 = (v: number) => String(Math.round(v * 100) / 100);

interface Point {
  date: string;
  time: string;
  value: number;
}
function velocityPoints(recs: VibrationRecordDto[], b: number): Point[] {
  return recs
    .filter((r) => !STOPPED_RE.test(r.note || "") && r.date)
    .flatMap((r) => {
      const vs = axes.map((a) => num(r.millData?.[`b${b}v${a}`])).filter((v): v is number => v !== null);
      return vs.length ? [{ date: r.date as string, time: r.measureTime || "", value: Math.max(...vs) }] : [];
    })
    .sort((a, b2) => a.date.localeCompare(b2.date) || a.time.localeCompare(b2.time));
}

/** [xu hướng, khuyến cáo] cho gối có vận tốc lớn nhất trong ngày `day` (từ bản ghi đã lưu của 1 máy). */
export function millAssessment(recs: VibrationRecordDto[], day: string): [string, string] {
  let bestB = 1;
  let bestV = -1;
  for (const b of MILL_BEARINGS) {
    const p = velocityPoints(recs, b).filter((x) => x.date === day).at(-1);
    if (p && p.value > bestV) {
      bestV = p.value;
      bestB = b;
    }
  }
  const pts = velocityPoints(recs.filter((r) => (r.date ?? "") <= day), bestB);
  const last = pts.filter((p) => p.date === day).at(-1);
  const prev = pts.filter((p) => p.date < day).at(-1);
  const ratio = last && prev && prev.value > 0 ? last.value / prev.value : null;
  const z = zoneOf(last?.value ?? null);
  const trend = !last
    ? "Chưa có số vận tốc (đến ngày chọn)"
    : !prev
      ? "Chưa có lần đo trước để so sánh"
      : prev.value === 0
        ? last.value === 0 ? "Giữ mức 0" : "Tăng từ 0 — không tính %"
        : ratio! >= 5 ? "Tăng ≥5× so với lần chạy trước"
        : ratio! >= 2 ? "Tăng ≥2× so với lần chạy trước"
        : ratio! >= 1.25 ? "Tăng ≥25% so với lần chạy trước"
        : ratio! < 1 ? "Giảm so với lần chạy trước"
        : "Chưa tăng ≥25% so với lần chạy trước";
  const attention = !!last && (["C", "D"].includes(z) || (ratio !== null && ratio >= 1.25));
  const advice = !last
    ? "Bổ sung số đo X/Y/Z khi máy chạy."
    : z === "D"
      ? "Báo người phụ trách, đo kiểm xác nhận sớm và đánh giá biện pháp xử lý theo quy trình vận hành; không tự ra lệnh dừng máy."
      : z === "C"
        ? "Theo dõi sát, đo xác minh và lập kế hoạch kiểm tra/khắc phục vào thời điểm phù hợp."
        : attention
          ? "Đo lại và tăng theo dõi; so với nền cùng điều kiện, thu thập FFT trước khi kết luận nguyên nhân."
          : "Tiếp tục theo dõi theo ca và giữ cách đo nhất quán; số tổng chưa chứng minh máy không có lỗi.";
  const head = last ? `Gối #${bestB}: ${r2(last.value)} mm/s${z !== "—" ? ` · vùng ${z}` : ""}` : `Gối #${bestB}`;
  return [`${head}\n${trend}`, advice];
}

// ---- Ảnh «Copy bảng thông số» ----
export function millCanvas(groups: MillGroup[], date: string, scope: string): HTMLCanvasElement {
  const F = '"Times New Roman",Times,serif';
  const LH = 19;
  const PAD = 10;
  const heads = [...heading, "XU HƯỚNG ĐỘ RUNG\n(Phân tích độ rung MILL)", "KHUYẾN CÁO"];
  const W = [78, 104, ...Array(6).fill(118), 92, 92, 92, 220, 230, 300] as number[];
  const TW = W.reduce((a, b) => a + b, 0);
  const X = [0];
  W.forEach((w, i) => X.push(X[i] + w));
  const fill: Record<number, string> = { 4: "#ffe69a", 5: "#ffb9be" };
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const P = 20;
  ctx.font = `bold 15px ${F}`;
  const hl = heads.map((h, i) => wrapText(ctx, h, W[i] - PAD));
  const hH = Math.max(...hl.map((x) => x.length)) * LH + PAD * 2;
  ctx.font = `15px ${F}`;
  const plan = groups.map((g) => ({
    g,
    rows: g.items.map((it) => {
      const w = warningStyles(it);
      const [tr, adv] = it.assess ?? ["", ""];
      const r = it.data;
      const top = [shortName(it.device.name), "Độ rung\n(mm/s; µm)", ...Array.from({ length: 6 }, (_, i) => bearing(r, i + 1))];
      const bot = ["", "Nhiệt độ\n(°C)", ...Array.from({ length: 6 }, (_, i) => String(num(r[`b${i + 1}t`]) ?? ""))];
      const span = [...["gearSmall", "gearRing", "oil"].map((k) => String(num(r[k]) ?? "")), noteText(it), tr, adv];
      const L = (t: string, i: number) => wrapText(ctx, t, W[i] - PAD).length;
      const h1 = Math.max(...top.map((t, i) => (i ? L(t, i) : 1))) * LH + PAD * 2;
      const h2 = Math.max(...bot.map((t, i) => (i ? L(t, i) : 1))) * LH + PAD * 2;
      const hs = Math.max(...span.map((t, k) => L(t, 8 + k))) * LH + PAD * 2;
      const extra = Math.max(0, hs - h1 - h2);
      return { w, top, bot, span, h1: h1 + extra / 2, h2: h2 + extra / 2 };
    }),
  }));
  const H = P + plan.reduce((n, p) => n + 64 + hH + p.rows.reduce((m, x) => m + x.h1 + x.h2, 0) + 40, 0) + P;
  cv.width = TW + 2 * P;
  cv.height = H;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, H);
  ctx.textBaseline = "top";
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  const cell = (x: number, y: number, w: number, h: number, text: string, o: { bg?: string; bold?: boolean; size?: number } = {}) => {
    const { bg, bold, size = 15 } = o;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = "#000";
    ctx.font = `${bold ? "bold " : ""}${size}px ${F}`;
    const ls = wrapText(ctx, text, w - PAD);
    const y0 = y + (h - ls.length * LH) / 2 + 2;
    ctx.textAlign = "center";
    ls.forEach((l, k) => ctx.fillText(l, x + w / 2, y0 + k * LH));
  };
  let y = P;
  for (const { g, rows } of plan) {
    const [t1, t2] = millTitle(g.area, date, scope).split("\n");
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.font = `bold 21px ${F}`;
    ctx.fillText(t1, P + TW / 2, y);
    ctx.font = `bold 17px ${F}`;
    ctx.fillText(t2, P + TW / 2, y + 28);
    y += 64;
    heads.forEach((h, i) => cell(P + X[i], y, W[i], hH, h, { bg: "#e8eef2", bold: true }));
    y += hH;
    for (const x of rows) {
      const H2 = x.h1 + x.h2;
      cell(P + X[0], y, W[0], H2, x.top[0]);
      cell(P + X[1], y, W[1], x.h1, x.top[1]);
      cell(P + X[1], y + x.h1, W[1], x.h2, x.bot[1]);
      for (let i = 0; i < 6; i++) {
        cell(P + X[2 + i], y, W[2 + i], x.h1, x.top[2 + i], { bg: fill[x.w.bearings[i]] });
        cell(P + X[2 + i], y + x.h1, W[2 + i], x.h2, x.bot[2 + i], { bg: fill[x.w.temps[i]] });
      }
      x.span.forEach((t, k) =>
        cell(P + X[8 + k], y, W[8 + k], H2, t, {
          bg: k < 3 ? fill[x.w.extras[k]] : k === 5 && /[DC]/.test(/vùng ([A-D])/.exec(x.span[4])?.[1] || "") ? "#fff4e5" : undefined,
          size: k >= 4 ? 14 : 15,
        })
      );
      y += H2;
    }
    ctx.textAlign = "left";
    ctx.font = `13px ${F}`;
    ctx.fillStyle = "#333";
    ctx.fillText(`X/Y/Z theo thứ tự; dòng trên mm/s, dòng dưới µm. ${warningLegend} Xu hướng / khuyến cáo: gối vận tốc lớn nhất, theo số đã lưu (sàng lọc theo ngưỡng ISO 20816-3 Nhóm 1).`, P, y + 10);
    y += 40;
  }
  return cv;
}
