/* eslint-disable @typescript-eslint/no-explicit-any */
// Đánh giá theo tài liệu Wowk "A Brief Tutorial on Machine Vibration" (Bảng 1 + Hình 5).
// Port từ vibracontrol/wowk-analysis.js: WOWK_CHART_*, wowkRow, wowkFreq, wowkEvalBearing, wowkLimits.
import { TC, vungBieuDoMd, rmsSangPkpk } from "./core";
import { LEVELS, type Level } from "./texts";
import { fmtN } from "./util";
import { worseLevel } from "./level";
import type { Machine } from "./machine";

export { rmsSangPkpk, vungBieuDoMd };

// wowk-analysis.js:WOWK_CHART_LEVEL / WOWK_CHART_VI
export const WOWK_CHART_LEVEL: Record<string, Level> = { GOOD: "normal", ACCEPTABLE: "normal", TOLERABLE: "watch", EXCESSIVE: "plan", "EXTREMELY ROUGH": "soon" };
export const WOWK_CHART_VI: Record<string, string> = { GOOD: "Tốt", ACCEPTABLE: "Chấp nhận được", TOLERABLE: "Tạm chấp nhận", EXCESSIVE: "Quá mức", "EXTREMELY ROUGH": "Cực kỳ xấu" };
// wowk-analysis.js:mmRmsToInPk / inPkToMmRms
export const mmRmsToInPk = (v: number) => (v * Math.SQRT2) / 25.4;
export const inPkToMmRms = (v: number) => (v * 25.4) / Math.SQRT2;
// wowk-analysis.js:wowkTable
export const wowkTable = (): any[] => TC.WOWK_BANG_1?.bang || [];

// wowk-analysis.js:wowkRow — chọn dòng Bảng 1 theo loại máy và tốc độ (tốc độ lớn nhất nếu có).
export function wowkRow(m: Machine): { row: any; note: string } | null {
  const n = m.speedMaxRpm || m.speedRpm;
  const cand = wowkTable().filter((r) => r.loai === m.type);
  if (!cand.length) return null;
  if (cand.length === 1) return { row: cand[0], note: "" };
  if (!n) {
    const r = cand.find((x) => x.ma === "quat_ly_tam_1000_2000") || cand[0];
    return { row: r, note: "chưa có tốc độ quay — tạm dùng dòng «" + r.ten + "»" };
  }
  const hit = cand.find((r) => (r.vpm_min == null || n >= r.vpm_min) && (r.vpm_max == null || n < r.vpm_max));
  if (hit) return { row: hit, note: "" };
  const dist = (r: any) => Math.min(...[r.vpm_min, r.vpm_max].filter((x) => x != null).map((x) => Math.abs(x - n)));
  const near = [...cand].sort((a, b) => dist(a) - dist(b))[0];
  return { row: near, note: `${n} v/p nằm ngoài các dải tốc độ của Bảng 1 — dùng dòng gần nhất «${near.ten}»` };
}
// wowk-analysis.js:wowkFreq — tần số tra Hình 5: tần số tương đương của phương đó, nếu không có thì 1X.
export const wowkFreq = (bv: any, dir: "X" | "Y", plan: any): number | null => (dir === "X" ? bv.fx : bv.fy) || plan.f1x || null;

// wowk-analysis.js:wowkEvalBearing — cùng dạng kết quả với evalBearing.
export function wowkEvalBearing(d: { machine?: Machine | null }, bv: any, plan: any, role = "chính"): any {
  const m = d.machine || {};
  const sel = wowkRow(m);
  const per: any[] = [];
  for (const dir of ["X", "Y"] as const) {
    const v = dir === "X" ? bv.vx : bv.vy;
    if (v == null) continue;
    const f = wowkFreq(bv, dir, plan);
    const vin = mmRmsToInPk(v);
    const out: any = { dir, v, vin, f, level: "na", parts: [] };
    if (sel) {
      const lim = inPkToMmRms(sel.row.van_toc_in_s_pk);
      const over = v > lim;
      out.limit = lim;
      out.t1 = over ? "Vượt Bảng 1" : "Trong Bảng 1";
      out.level = over ? "plan" : "normal";
      out.parts.push(`${out.t1} (${fmtN(v)} ${over ? ">" : "≤"} ${fmtN(lim, 2)} mm/s RMS)`);
      const dd = dir === "X" ? bv.dRmsX : bv.dRmsY;
      if (dd != null) {
        const dpp = rmsSangPkpk(dd);
        const dl = sel.row.dich_chuyen_mils_pp * 25.4;
        out.dpp = dpp;
        out.dLimit = dl;
        if (dpp > dl) out.parts.push(`dịch chuyển ${fmtN(dpp, 1)} µm pk-pk > ${fmtN(dl, 1)} (giới hạn 1X — số tổng chỉ để tham khảo)`);
      }
    }
    if ((f as number) >= 1 && (f as number) <= 1000) {
      const z = vungBieuDoMd(TC.MD_CHART_1989, f as number, vin);
      out.chart = z;
      out.level = worseLevel(out.level, WOWK_CHART_LEVEL[z]);
      out.parts.push(`Hình 5: ${WOWK_CHART_VI[z]} tại ${fmtN(f, 1)} Hz`);
    }
    if (out.level !== "na") per.push(out);
  }
  if (!per.length) return null;
  const worst = per.reduce((a, b) => (LEVELS[b.level as Level].rank > LEVELS[a.level as Level].rank || (LEVELS[b.level as Level].rank === LEVELS[a.level as Level].rank && b.v > a.v) ? b : a));
  const lim = sel ? inPkToMmRms(sel.row.van_toc_in_s_pk) : null;
  const rg: Record<string, number> = lim ? { "Wowk Bảng 1": lim } : {};
  return {
    ev: { role, id: "WOWK", label: "Tài liệu Wowk" + (sel ? " · Bảng 1 «" + sel.row.ten + "»" : " · chỉ Hình 5") + (sel?.note ? " (" + sel.note + ")" : "") },
    kind: "wowk", g: null, per,
    text: per.map((p) => `${p.dir}: ${p.parts.join("; ")}`).join(" · "),
    level: worst.level, v: worst.v, dir: worst.dir, near: [], rg, coSo: lim ?? inPkToMmRms(0.3), trip: null,
  };
}

// wowk-analysis.js:wowkLimits — ngưỡng hiển thị ở bảng/biểu đồ xu hướng khi ISO không đủ thông tin.
export function wowkLimits(m: Machine): { warn: number | null; danger: number | null; source: string } | null {
  const sel = wowkRow(m);
  const f = m.speedMaxRpm || m.speedRpm ? (m.speedMaxRpm || m.speedRpm) / 60 : null;
  const md = TC.MD_CHART_1989.ranh_gioi;
  const at = (i: number): number | null => ((f as number) >= 1 && (f as number) <= 1000 ? inPkToMmRms(md[i].V * Math.min((f as number) / md[i].f_dau, 1, md[i].f_cuoi / (f as number))) : null);
  if (!sel && !((f as number) >= 1 && (f as number) <= 1000)) return null;
  return {
    warn: sel ? inPkToMmRms(sel.row.van_toc_in_s_pk) : at(2),
    danger: at(3) ?? (sel ? 2 * inPkToMmRms(sel.row.van_toc_in_s_pk) : null),
    source: "Tài liệu Wowk" + (sel ? " · Bảng 1" : "") + (f ? " · Hình 5" : ""),
  };
}
