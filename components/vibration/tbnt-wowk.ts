/** Đánh giá "Theo dõi (Wowk)" cho bơm nước thô, chuyển từ wowk-analysis.js (wowkEvalBearing) của VibraControl cũ.
 *  Bảng 1 (giới hạn theo loại máy) + Hình 5 (Machine Dynamics 1989, tần số 1X vì bảng TBNT chỉ có số tổng).
 *  Chỉ là khuyến cáo theo dõi, không phải lệnh dừng máy. */

export type WowkLevel = "na" | "normal" | "watch" | "plan" | "soon" | "stop";

export const WOWK_LEVEL: Record<WowkLevel, { rank: number; label: string }> = {
  na: { rank: 0, label: "Không đánh giá" },
  normal: { rank: 1, label: "Bình thường" },
  watch: { rank: 2, label: "Theo dõi" },
  plan: { rank: 3, label: "Lên kế hoạch sửa" },
  soon: { rank: 4, label: "Sửa sớm nhất" },
  stop: { rank: 5, label: "Dừng máy (khuyến cáo)" },
};

interface Wowk1Row {
  ma: string;
  ten: string;
  loai: string;
  min: number | null;
  max: number | null;
  inPk: number; // giới hạn vận tốc tổng, in/s peak
}

// Bảng 1 (WOWK tr.3): mã, tên, loại máy, dải tốc độ v/p, vận tốc in/s pk.
const WOWK_BANG_1: Wowk1Row[] = [
  { ma: "dong_co_1000_2000", ten: "Động cơ điện 1 000–2 000 v/p", loai: "dong_co", min: 1000, max: 2000, inPk: 0.2 },
  { ma: "dong_co_tren_2000", ten: "Động cơ điện > 2 000 v/p", loai: "dong_co", min: 2000, max: null, inPk: 0.2 },
  { ma: "may_phat", ten: "Máy phát", loai: "may_phat", min: null, max: null, inPk: 0.2 },
  { ma: "quat_ly_tam_duoi_600", ten: "Quạt ly tâm < 600 v/p", loai: "quat", min: null, max: 600, inPk: 0.3 },
  { ma: "quat_ly_tam_600_1000", ten: "Quạt ly tâm 600–1 000 v/p", loai: "quat", min: 600, max: 1000, inPk: 0.3 },
  { ma: "quat_ly_tam_1000_2000", ten: "Quạt ly tâm 1 000–2 000 v/p", loai: "quat", min: 1000, max: 2000, inPk: 0.3 },
  { ma: "quat_ly_tam_tren_2000", ten: "Quạt ly tâm > 2 000 v/p", loai: "quat", min: 2000, max: null, inPk: 0.3 },
  { ma: "quat_huong_truc", ten: "Quạt hướng trục (vaneaxial)", loai: "quat_huong_truc", min: null, max: null, inPk: 0.2 },
  { ma: "may_thoi", ten: "Máy thổi (blower)", loai: "may_thoi_roots", min: null, max: null, inPk: 0.3 },
  { ma: "bom", ten: "Bơm", loai: "bom", min: null, max: null, inPk: 0.2 },
  { ma: "may_nen_ly_tam", ten: "Máy nén ly tâm", loai: "may_nen_ly_tam", min: null, max: null, inPk: 0.2 },
  { ma: "hop_so_thap_giai_nhiet", ten: "Hộp số tháp giải nhiệt", loai: "hop_so_thap_giai_nhiet", min: null, max: null, inPk: 0.4 },
  { ma: "dong_co_dot_trong", ten: "Động cơ đốt trong (khí/diesel)", loai: "dong_co_dot_trong", min: null, max: null, inPk: 1 },
  { ma: "tuabin", ten: "Tuabin", loai: "tuabin_hoi", min: null, max: null, inPk: 0.2 },
  { ma: "hop_so", ten: "Hộp số", loai: "hop_so", min: null, max: null, inPk: 0.4 },
  { ma: "may_nen_truc_vit_doi", ten: "Máy nén trục vít đôi", loai: "may_nen_truc_vit", min: null, max: null, inPk: 1 },
];

// Hình 5 (đọc xấp xỉ từ ảnh): ranh giới(f) = V * min(f/f_dau, 1, f_cuoi/f), đơn vị in/s peak.
const MD_CHART_1989 = [
  { V: 0.03, fStart: 45, fEnd: 200 },
  { V: 0.1, fStart: 30, fEnd: 165 },
  { V: 0.3, fStart: 10, fEnd: 190 },
  { V: 0.7, fStart: 2.3, fEnd: 250 },
];
const ZONE_LEVEL: WowkLevel[] = ["normal", "normal", "watch", "plan", "soon"]; // GOOD, ACCEPTABLE, TOLERABLE, EXCESSIVE, EXTREMELY ROUGH

const mmRmsToInPk = (v: number) => (v * Math.SQRT2) / 25.4;
const inPkToMmRms = (v: number) => (v * 25.4) / Math.SQRT2;
const worse = (a: WowkLevel, b: WowkLevel) => (WOWK_LEVEL[b].rank > WOWK_LEVEL[a].rank ? b : a);

function zoneIndex(f: number, vInPk: number) {
  let n = 0;
  for (const rg of MD_CHART_1989) if (vInPk > rg.V * Math.min(f / rg.fStart, 1, rg.fEnd / f)) n++;
  return n;
}

function wowkRow(m: Record<string, unknown>): Wowk1Row | null {
  const speed = Number(m.speedMaxRpm || m.speedRpm) || 0;
  const cand = WOWK_BANG_1.filter((r) => r.loai === m.type);
  if (!cand.length) return null;
  if (cand.length === 1) return cand[0];
  if (!speed) return cand.find((r) => r.ma === "quat_ly_tam_1000_2000") ?? cand[0];
  const hit = cand.find((r) => (r.min == null || speed >= r.min) && (r.max == null || speed < r.max));
  if (hit) return hit;
  const dist = (r: Wowk1Row) => Math.min(...[r.min, r.max].filter((x): x is number => x != null).map((x) => Math.abs(x - speed)));
  return [...cand].sort((a, b) => dist(a) - dist(b))[0];
}

export interface TbntBearing {
  id: "motorNDE" | "motorDE" | "pumpNDE" | "pumpDE";
  label: string; // Động cơ NDE ...
  vx: number; // chỉ số trong mảng 23 giá trị
  vy: number;
  t: number;
}
/** 4 điểm đo của mỗi bơm theo spec 4.1. */
export const TBNT_BEARINGS: TbntBearing[] = [
  { id: "motorNDE", label: "Động cơ NDE", vx: 3, vy: 5, t: 7 },
  { id: "motorDE", label: "Động cơ DE", vx: 8, vy: 10, t: 12 },
  { id: "pumpNDE", label: "Bơm NDE", vx: 13, vy: 15, t: 17 },
  { id: "pumpDE", label: "Bơm DE", vx: 18, vy: 20, t: 22 },
];

export interface WowkStatus {
  /** none: chưa có số; unrated: thiếu thông số máy; stopped: máy dừng / dự phòng; rated: có đánh giá. */
  state: "none" | "unrated" | "stopped" | "rated";
  level: WowkLevel;
  text: string;
  where: string;
  detail: string;
}

const result = (state: WowkStatus["state"], level: WowkLevel, text: string, where = "", detail = ""): WowkStatus => ({ state, level, text, where, detail });

/** Gối có vận tốc lớn nhất → đánh giá Wowk (Bảng 1 + Hình 5 tại 1X). `machine` = thông số máy của bơm. */
export function wowkStatus(machine: Record<string, unknown> | null | undefined, values: (number | null)[]): WowkStatus {
  const numbers = values.filter((n): n is number => n != null);
  if (!numbers.length) return result("none", "na", "Chưa nhập");
  const current = values.slice(0, 3).filter((n): n is number => n != null);
  if (numbers.every((n) => n === 0) || (current.length > 0 && current.every((n) => n === 0))) {
    return result("stopped", "na", "Máy dừng / dự phòng");
  }
  const m = machine ?? {};
  const row = wowkRow(m);
  const speed = Number(m.speedRpm) || 0;
  const f1x = speed ? speed / 60 : null;
  if (!row && !(f1x && f1x >= 1 && f1x <= 1000)) return result("unrated", "na", "Chưa đánh giá", "", "Thiếu loại máy / tốc độ quay trong thông số máy.");

  let best: { b: TbntBearing; v: number } | null = null;
  for (const b of TBNT_BEARINGS) {
    const v = Math.max(values[b.vx] ?? -1, values[b.vy] ?? -1);
    if (v >= 0 && (!best || v > best.v)) best = { b, v };
  }
  if (!best) return result("none", "na", "Chưa nhập");

  const parts: { dir: "X" | "Y"; v: number; level: WowkLevel; text: string }[] = [];
  for (const dir of ["X", "Y"] as const) {
    const v = values[dir === "X" ? best.b.vx : best.b.vy];
    if (v == null) continue;
    let level: WowkLevel = "na";
    const text: string[] = [];
    if (row) {
      const lim = inPkToMmRms(row.inPk);
      const over = v > lim;
      level = over ? "plan" : "normal";
      text.push(`${over ? "Vượt" : "Trong"} Bảng 1 (${Number(v.toFixed(2))} ${over ? ">" : "≤"} ${lim.toFixed(2)} mm/s RMS)`);
    }
    if (f1x && f1x >= 1 && f1x <= 1000) {
      const z = zoneIndex(f1x, mmRmsToInPk(v));
      level = worse(level, ZONE_LEVEL[z]);
      text.push(`Hình 5 vùng ${z + 1}/5 tại ${f1x.toFixed(1)} Hz`);
    }
    if (level !== "na") parts.push({ dir, v, level, text: text.join("; ") });
  }
  if (!parts.length) return result("unrated", "na", "Chưa đánh giá");
  const worst = parts.reduce((a, b) => (WOWK_LEVEL[b.level].rank > WOWK_LEVEL[a.level].rank || (WOWK_LEVEL[b.level].rank === WOWK_LEVEL[a.level].rank && b.v > a.v) ? b : a));
  return result(
    "rated",
    worst.level,
    WOWK_LEVEL[worst.level].label,
    `${best.b.label} ${worst.dir} · ${Number(worst.v.toFixed(2))} mm/s`,
    parts.map((p) => `${p.dir}: ${p.text}`).join(" · ")
  );
}

/** Giới hạn cảnh báo vận tốc (mm/s RMS) theo Bảng 1 cho máy này; null nếu chưa rõ loại máy. */
export function wowkLimitMmRms(machine: Record<string, unknown> | null | undefined): number | null {
  const row = wowkRow(machine ?? {});
  return row ? inPkToMmRms(row.inPk) : null;
}
