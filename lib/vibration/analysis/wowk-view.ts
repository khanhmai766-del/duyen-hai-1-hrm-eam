/* eslint-disable @typescript-eslint/no-explicit-any */
// Mô hình tính của trang "Theo tài liệu Wowk" cho thiết bị trong danh mục.
// Port từ vibracontrol/wowk-analysis.js:wowkCatalogueView (phần tính — không có HTML) và wowkSeries.
import { TC, rmsSangPkpk, vungBieuDoMd } from "./core";
import { fmtN } from "./util";
import { analyzeRecord, BEARINGS, bearingValues, datedRecords, qualityCheck, standardPlan, worseLevel } from "./engine";
import { LEVELS, type Level } from "./texts";
import { inPkToMmRms, mmRmsToInPk, wowkEvalBearing, wowkFreq, wowkRow } from "./wowk";
import type { AnalysisDevice, AnalysisRecord, AnalysisSettings, BearingDef } from "./types";

// wowk-analysis.js:wowkSeries
export function wowkSeries(d: AnalysisDevice, b: BearingDef, plan: any) {
  return datedRecords(d).map((r) => ({ r, q: qualityCheck(d, r, null, plan.f1x) })).filter((p) => !p.q.stopped).map((p) => ({ date: p.r.date, bv: bearingValues(p.q, b) })).filter((p) => p.bv.v != null);
}

// wowk-analysis.js:wowkCatalogueView (s1..s8)
export function wowkCatalogueModel(d: AnalysisDevice, recs: AnalysisRecord[], r: AnalysisRecord, settings?: Partial<AnalysisSettings> | null) {
  const plan = standardPlan(d);
  const res = analyzeRecord(d, r, { history: recs, plan, settings });
  const m = d.machine || {};
  const sel = wowkRow(m);
  const q = res.q;
  const isoOk = !!plan.main && plan.forPart("motor").length > 0;
  if (q.stopped) return { plan, res, sel, isoOk, stopped: true as const };
  // 1. Bảng khảo sát (Bảng 2)
  const rows: any[] = [];
  const pts: any[] = [];
  for (const b of BEARINGS) {
    const bv = bearingValues(q, b);
    if (bv.v == null && bv.t == null) continue;
    for (const dir of ["X", "Y"] as const) {
      const v = dir === "X" ? bv.vx : bv.vy;
      if (v == null) continue;
      const dd = dir === "X" ? bv.dRmsX : bv.dRmsY;
      const dpp = dd != null ? rmsSangPkpk(dd) : null;
      const f = wowkFreq(bv, dir, plan);
      const vin = mmRmsToInPk(v);
      const zone = (f as number) >= 1 && (f as number) <= 1000 ? vungBieuDoMd(TC.MD_CHART_1989, f as number, vin) : null;
      rows.push({ b, dir, v, vin, dpp, f, zone, t: bv.t });
      pts.push({ dir, v, vin, f, zone, label: `${b.label} ${dir}`, short: b.label + " " + dir });
    }
  }
  const lim = sel ? sel.row : null;
  // 2. Mức độ (Bảng 1 + Hình 5)
  const worst = rows.reduce((a: any, x: any) => (!a || x.v > a.v ? x : a), null);
  const t1 = lim ? rows.map((x) => ({ ...x, over: x.v > inPkToMmRms(lim.van_toc_in_s_pk) })) : [];
  // 3. Lưu đồ Hình 1
  const serious = t1.some((x) => x.over) || rows.some((x) => ["EXCESSIVE", "EXTREMELY ROUGH"].includes(x.zone));
  const worstB = worst?.b as BearingDef | undefined;
  const series = worstB ? wowkSeries(d, worstB, plan).slice(-8) : [];
  const vals = series.map((p) => p.bv.v as number);
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1));
  let turns = 0;
  for (let i = 2; i < vals.length; i++) if (Math.sign(vals[i] - vals[i - 1]) * Math.sign(vals[i - 1] - vals[i - 2]) < 0) turns++;
  const bvW = worstB ? bearingValues(q, worstB) : null;
  const ratioW = bvW?.ratio;
  const res1: [string, boolean | null, string][] = [
    ["Biên độ rất cao bất thường", lim && worst ? worst.v > 2 * inPkToMmRms(lim.van_toc_in_s_pk) : ["EXTREMELY ROUGH"].includes(worst?.zone), lim ? "> 2 × giới hạn Bảng 1 (quy ước của phần mềm)" : "vùng Cực kỳ xấu ở Hình 5"],
    ["Rung định hướng rõ", ratioW != null && ratioW >= 2.5, ratioW != null ? `tỉ lệ X/Y ${fmtN(ratioW, 2)} (≥ 2,5 — quy ước)` : "thiếu một phương"],
    ["Biên độ lên xuống, không ổn định", vals.length >= 4 && sd / mean > 0.3 && turns >= 2, vals.length >= 4 ? `${vals.length} lần đo gần nhất: biến thiên ${fmtN((sd / mean) * 100, 0)} %, đổi chiều ${turns} lần` : "chưa đủ 4 lần đo"],
    ["Ầm khi khởi động / dừng máy", null, "bảng tuần không ghi — hỏi vận hành"],
  ];
  const nRes = res1.filter((x) => x[1] === true).length;
  // 4. Chẩn đoán theo Bảng 3
  const f1 = plan.f1x;
  const fW = worst?.f;
  const ord = f1 && fW ? fW / f1 : null;
  const causes: [string, string][] =
    ord == null ? []
    : ord < 0.8 ? [["Xoáy dầu", "~0,45 × 1X, máy tốc độ cao ổ bạc trượt"], ["Lỏng cơ khí", "½X, 1½X…; giảm khi tăng tải"], ["Dây đai", "tần số đai"], ["Phách", "hai máy chạy gần cùng tốc độ, biên độ lúc có lúc không"], ["Cộng hưởng", "đỉnh rời rạc, biên độ rất cao"]]
    : ord <= 1.3 ? [["Mất cân bằng", "1X, chủ yếu hướng kính; lỗi thường gặp"], ["Lệch đồng tâm", "1X + hài, 2X–3X cao, dọc trục cao; lỗi thường gặp"], ["Lệch tâm", "giống mất cân bằng, không sửa được bằng đối trọng"], ["Cong trục", "giống mất cân bằng, sửa được bằng đối trọng lớn ở giữa"], ["Chân mềm", "giảm mạnh khi nới một bu-lông chân"]]
    : ord <= 3.5 ? [["Lệch đồng tâm", "2X, 3X + hài; dọc trục cao; đổi theo nhiệt độ"], ["Lỏng cơ khí", "½X, 1½X, 2½X…; giảm khi tăng tải"], ["Điện động cơ", "2 × tần số lưới (100 Hz ở lưới 50 Hz); mất ngay khi cắt điện"]]
    : [["Ổ lăn", "FTF ≈ 0,4 × 1X; vòng ngoài ≈ 0,4 × 1X × số viên bi; vòng trong ≈ 0,6 × 1X × số viên bi; xung va đập ở dạng sóng"], ["Cánh (quạt/bơm)", "1X × số cánh — lành tính"], ["Bánh răng", "1X × số răng, dải biên quanh tần số ăn khớp"], ["Xâm thực", "dải rộng 3–5 kHz, thường lành tính"]];
  // 5. Sáu tiêu chí phán đoán
  const ratios = res.bearings.flatMap((b: any) => Object.entries<any>(b.dirs || {}).filter(([, o]) => o.base).map(([dir, o]) => ({ b: b.b, dir, base: o.base, v: o.v, r: o.v / o.base, step: o.step, prevV: o.prevV })));
  const hot = res.bearings.filter((b: any) => b.tRise);
  const steps = res.bearings.filter((b: any) => b.step);
  const motorMax = Math.max(0, ...res.bearings.filter((b: any) => b.b.part === "motor").map((b: any) => b.v || 0));
  const machMax = Math.max(0, ...res.bearings.filter((b: any) => b.b.part === "machine").map((b: any) => b.v || 0));
  const curNow = q.amps.length ? q.amps.reduce((a: number, b: number) => a + b, 0) / q.amps.length : null;
  // 8. Kết luận
  const w = res.bearings.map((b: any) => wowkEvalBearing(d, b, plan)).filter(Boolean);
  let lvW: Level = w.reduce((l: Level, e: any) => worseLevel(l, e.level), "na" as Level);
  const whyW: string[] = [];
  const r5 = ratios.filter((x: any) => x.r >= 5);
  const r2 = ratios.filter((x: any) => x.r >= 2 && x.r < 5);
  if (r5.length) { lvW = worseLevel(lvW, "plan"); whyW.push("Tăng ≥ 5× so với nền: " + r5.map((x: any) => x.b.label + " " + x.dir).join(", ") + " — nghiêm trọng [WOWK tr.8].") }
  if (r2.length) { lvW = worseLevel(lvW, "watch"); whyW.push("Tăng ≥ 2× so với nền: " + r2.map((x: any) => x.b.label + " " + x.dir).join(", ") + " — có thay đổi vật lý đáng kể [WOWK tr.8].") }
  if (steps.length) { lvW = worseLevel(lvW, "soon"); whyW.push("Tăng đột bậc: " + steps.map((b: any) => b.b.label + " " + b.stepDir).join(", ") + " — dấu hiệu ổ không ổn định, kiểm tra ổ và gối đỡ sớm [WOWK tr.9].") }
  if (hot.length) { lvW = worseLevel(lvW, "soon"); whyW.push("Nhiệt gối tăng: " + hot.map((b: any) => b.b.label).join(", ") + " — hành động ngay vì ma sát, giãn nở nhiệt, nguy cơ bó kẹt [WOWK tr.9].") }
  void LEVELS;
  return { plan, res, sel, isoOk, stopped: false as const, rows, pts, lim, t1, worst, serious, res1, nRes, ord, f1, causes, ratios, hot, steps, motorMax, machMax, curNow, lvW, whyW };
}
