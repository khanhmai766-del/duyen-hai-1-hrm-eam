/* eslint-disable @typescript-eslint/no-explicit-any */
// BẰNG CHỨNG "ĐÚNG LOGIC": chạy MÃ GỐC của VibraControl cũ (vm + stub window/document) và bộ phân tích mới (lib/vibration/analysis)
// trên số liệu THẬT trong CSDL cục bộ (đọc, không ghi) rồi so sánh kết quả: trạng thái, ngưỡng, vùng, tiêu chuẩn đã chọn, số (sai số ≤ 1e-9).
// Chạy: npx tsx --test tests/vibration-analysis-parity.test.ts   (cần Postgres :5433 đang chạy)
// Thư mục mã cũ: biến môi trường VIBRACONTROL_DIR (mặc định D:\Dự an AI\Web PXVH1\vibracontrol).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import vm from "node:vm";
import { PrismaClient } from "@prisma/client";
import * as A from "../lib/vibration/analysis";

const OLD_DIR = process.env.VIBRACONTROL_DIR || "D:\\Dự an AI\\Web PXVH1\\vibracontrol";
for (const l of readFileSync(path.join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const prisma = new PrismaClient();
const TOL = 1e-9;

// ---------- Nạp mã cũ vào vm ----------
const readOld = (f: string) => readFileSync(path.join(OLD_DIR, f), "utf8");
function loadOld() {
  const ctx: any = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const run = (code: string, name: string) => vm.runInContext(code, ctx, { filename: name });
  // Stub tối thiểu cho DOM / app.js
  run(`
    var window=globalThis; window.addEventListener=function(){}; window.VC_BOOT=true; window.vcDataVer=0; window.SERVER_MODE=false;
    var document={addEventListener(){},querySelector(){return null},querySelectorAll(){return []},body:{classList:{add(){},remove(){}}},getElementById(){return null}};
    var localStorage={getItem(){return null},setItem(){},removeItem(){}};
    var MutationObserver=function(){this.observe=function(){}};
    var db={devices:[],analysisSettings:{},externalReports:[],areas:[]}; var page='overview'; var render=function(){}; var save=function(){};
    var $=function(){return null}; var esc=function(v){return String(v??'')};
    var seed={devices:[{labels:[]}]};
    var machineTypes0=0;
  `, "stub");
  const app = readOld("app.js").split(/\r?\n/);
  const line = (prefix: string) => {
    const l = app.find((x) => x.startsWith(prefix));
    if (!l) throw new Error("app.js thiếu dòng: " + prefix);
    return l;
  };
  const i0 = app.findIndex((x) => x.startsWith("function statusFor("));
  let i1 = i0;
  while (app[i1] !== "}") { i1++; assert.ok(i1 < app.length, "không tìm thấy hết statusFor"); }
  const num = /num=(v=>[^,;]+)/.exec(line("const $=s=>"));
  assert.ok(num, "không tách được num từ app.js");
  run(
    [
      `const num=${num[1]};`,
      line("const maximum="),
      line("const VIB_IDX="),
      line("const alertDefaults="),
      line("const ensureAlertConfig="),
      line("const hasReading="),
      line("function readingMax("),
      app.slice(i0, i1 + 1).join("\n"),
      line("function recordAssessment("),
      line("const latest="),
    ].join("\n"),
    "app.js(extract)"
  );
  for (const f of ["measure-values.js", "vibration-standards.js", "vibration-core.js", "machine-params.js", "vibration-analysis.js", "wowk-analysis.js"]) run(readOld(f), f);
  // mill-shift.js: chỉ IIFE đầu (MillShift) — phần sau là DOM
  const ms = readOld("mill-shift.js").split(/\r?\n/);
  run(ms.slice(0, 28).join("\n"), "mill-shift.js(1-28)");
  run(readOld("mill-analysis.js"), "mill-analysis.js");
  for (const f of ["external-analysis.js", "external-wowk.js", "analysis-hub.js"]) run(readOld(f), f);
  run(
    `globalThis.__old={VC,readCell,cellNum,standardPlan,vibrationLimitFor,analyzeRecord,qualityCheck,bearingValues,actionPlan,datedRecords,wowkEvalBearing,wowkLimits,wowkRow,
      statusFor,readingMax,recordAssessment,ensureAlertConfig,MillAnalysis:window.MillAnalysis,MillShift:window.MillShift,externalAnalyze,ewAnalyze,ewLevel,BEARINGS,analysisDefaults,
      setSettings:s=>{db.analysisSettings=s}};`,
    "export"
  );
  return ctx.__old;
}

// ---------- So sánh sâu, sai số số học ----------
const mismatches: string[] = [];
function deepClose(a: any, b: any, p: string): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (a === b) return true;
    if (Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b))) return true;
    mismatches.push(`${p}: ${a} ≠ ${b}`);
    return false;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (a === b) return true;
    mismatches.push(`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { mismatches.push(`${p}: kiểu mảng khác nhau`); return false; }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
  const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
  if (ka.join("|") !== kb.join("|")) { mismatches.push(`${p}: khoá khác nhau [${ka}] vs [${kb}]`); return false; }
  let ok = true;
  for (const k of ka) if (!deepClose(a[k], b[k], p + "." + k)) ok = false;
  return ok;
}
/** Chuẩn hoá để so sánh: bỏ hàm, thay thiết bị/bản ghi bằng nhãn, số vô hạn → chuỗi. */
function norm(x: any, depth = 0): any {
  if (x === undefined) return undefined;
  if (typeof x === "number") return Number.isFinite(x) ? x : String(x);
  if (typeof x === "function") return undefined;
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map((y) => norm(y, depth + 1));
  if (Array.isArray(x.records)) return "[device]";
  if (Array.isArray(x.values) && "date" in x) return "[record]";
  const o: any = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === "settings" || k === "generatedAt") continue; // settings: chỉ có ở bản mới; generatedAt = giờ chạy
    if (k === "runs") { o.runs = (v as any[]).map((p) => norm(p.q, depth + 1)); continue; } // runs[].x là bản ghi
    const n = norm(v, depth + 1);
    if (n !== undefined) o[k] = n;
  }
  return o;
}
const stats: Record<string, { n: number; bad: number }> = {};
function cmp(group: string, label: string, a: any, b: any) {
  const s = (stats[group] ??= { n: 0, bad: 0 });
  s.n++;
  const before = mismatches.length;
  deepClose(norm(a), norm(b), label);
  if (mismatches.length > before) s.bad++;
}

// ---------- Dữ liệu thật ----------
let OLD: any;
let devices: any[] = []; // dạng cũ (device + records)
let newDevices: any[] = []; // dạng mới
const kindsOf = (d: any) => new Set(d.records.map((r: any) => r.kind));

before(async () => {
  OLD = loadOld();
  const devs = await prisma.vibrationDevice.findMany();
  const recs = await prisma.vibrationRecord.findMany({ orderBy: { savedAt: "asc" } });
  const by = new Map<string, any[]>();
  for (const r of recs) (by.get(r.deviceId) ?? by.set(r.deviceId, []).get(r.deviceId)!).push(r);
  for (const d of devs) {
    const rows = by.get(d.id) ?? [];
    const base = { id: d.legacyId, name: d.name, area: d.area, system: d.system, machine: d.machine ?? undefined, alertConfig: (d.alertConfig as any) ?? {} };
    const oldRecords = rows.map((r) => ({
      id: r.id, date: r.date, measureTime: r.measureTime, person: r.person, values: r.values, extra: {}, note: r.note, savedAt: r.savedAt.toISOString(),
      source: r.kind === "MILL" ? "Mill theo ca" : r.kind === "TBNT" ? "TBNT theo ca" : r.kind === "HISTORY_XLSX" ? "x.xlsx" : "Nhập liệu",
      millData: r.millData ? { ...(r.millData as any), shift: r.shift } : undefined,
    }));
    const newRecords = rows.map((r) => ({
      id: r.id, date: r.date, measureTime: r.measureTime, person: r.person, values: r.values as unknown[], extra: {}, note: r.note, savedAt: r.savedAt.toISOString(),
      kind: r.kind, shift: r.shift, millData: (r.millData as any) ?? null,
    }));
    devices.push({ ...structuredClone(base), records: oldRecords, _kinds: new Set(rows.map((r) => r.kind)) });
    newDevices.push({ ...structuredClone(base), records: newRecords, _kinds: new Set(rows.map((r) => r.kind)) });
  }
});
after(async () => {
  await prisma.$disconnect();
  console.log("\n=== PARITY: số phép so sánh (n) / lệch (bad) theo nhóm ===");
  for (const [k, v] of Object.entries(stats)) console.log(`${k.padEnd(34)} n=${String(v.n).padStart(6)}  bad=${v.bad}`);
  console.log("Tổng phép so sánh:", Object.values(stats).reduce((a, v) => a + v.n, 0));
});

/** Bản sao nhẹ của thiết bị cũ (không chép records; ensureAlertConfig của mã cũ có ghi vào alertConfig). */
const light = (d: any) => ({ id: d.id, name: d.name, area: d.area, system: d.system, machine: d.machine, alertConfig: { ...(d.alertConfig || {}) }, records: [] as any[] });

test("0. dữ liệu thật đủ rộng", () => {
  const counts: Record<string, number> = {};
  for (const d of devices) for (const r of d.records) counts[r.source] = (counts[r.source] || 0) + 1;
  console.log("bản ghi theo nguồn:", counts, "thiết bị:", devices.length, "có machine:", devices.filter((d) => d.machine && Object.keys(d.machine).length).length);
  assert.ok(Object.values(counts).reduce((a, b) => a + b, 0) >= 300);
});

test("1. VC lõi: hàm thuần trên lưới giá trị", () => {
  const VC_OLD = OLD.VC;
  const vs = [0, 0.3, 0.9, 1.4, 1.41, 2.3, 2.8, 3.5, 4.5, 4.51, 7.1, 11, 11.5, 15];
  for (const nhom of ["1", "2"]) for (const g of ["cung", "mem"]) for (const v of vs) for (const dr of [null, 5, 30, 90, 200]) {
    const o = VC_OLD.danhGiaIso20816_3(VC_OLD.TC.ISO_20816_3_2022, nhom, g, [v], dr == null ? [] : [dr]);
    const n = A.VC.danhGiaIso20816_3(A.VC.TC.ISO_20816_3_2022, nhom, g, [v], dr == null ? [] : [dr]);
    cmp("VC.danhGiaIso20816_3", `iso3 ${nhom}${g}${v}${dr}`, o, n);
  }
  for (const loai of ["I"]) for (const P of [5, 200, 201, 900]) for (const v of vs) cmp("VC.danhGiaBomIso10816_7", `bom${P}${v}`, VC_OLD.danhGiaBomIso10816_7(VC_OLD.TC.ISO_10816_7_2009, loai, P, [v]), A.VC.danhGiaBomIso10816_7(A.VC.TC.ISO_10816_7_2009, loai, P, [v]));
  for (const P of [10, 100, 298, 299, 500]) {
    cmp("VC.hangBvQuat", `bv${P}`, VC_OLD.hangBvQuat(VC_OLD.TC.ISO_14694_2003_AMCA_204_20, P), A.VC.hangBvQuat(A.VC.TC.ISO_14694_2003_AMCA_204_20, P));
    for (const bv of ["BV-3", "BV-4"]) for (const g of ["cung", "mem"]) for (const v of vs) {
      let o: any, n: any;
      try { o = VC_OLD.danhGiaQuatBv(VC_OLD.TC.ISO_14694_2003_AMCA_204_20, bv, g, [v]); } catch (e: any) { o = "ERR " + e.message; }
      try { n = A.VC.danhGiaQuatBv(A.VC.TC.ISO_14694_2003_AMCA_204_20, bv, g, [v]); } catch (e: any) { n = "ERR " + e.message; }
      cmp("VC.danhGiaQuatBv", `fan${bv}${g}${v}`, o, n);
    }
  }
  for (const f of [0.5, 1, 2.3, 8, 16.5, 50, 100, 400, 1000, 1500]) for (const v of [0.005, 0.02, 0.1, 0.3, 0.8, 1.2, 1.6]) cmp("VC.vungBieuDoMd", `md${f}-${v}`, VC_OLD.vungBieuDoMd(VC_OLD.TC.MD_CHART_1989, f, v), A.VC.vungBieuDoMd(A.VC.TC.MD_CHART_1989, f, v));
  const machines: any[] = [];
  for (const loai of ["dong_co", "quat", "bom", "may_nghien", "bang_tai", "hop_so", "may_nen_truc_vit", "tuabin_hoi", "may_phat", "khac"]) for (const P of [0, 10, 15.5, 90, 300, 301, 2300, 45000]) for (const n of [0, 100, 600, 1480, 2960, 3000, 31000]) for (const gia of [undefined, "cung", "mem"]) for (const kb of [undefined, "bun"]) machines.push({ loai, cong_suat_kw: P, toc_do_vpm: n, gia_do: gia, kieu_bom: kb, thu_tai_xuong: false });
  for (const [i, m] of machines.entries()) cmp("VC.chonTieuChuan", `chon${i}`, VC_OLD.chonTieuChuan(m), A.VC.chonTieuChuan(m));
  for (const [x, y, z] of [[1, 2, 3], [0.5, 1, 4], [3, 1, 2]]) {
    cmp("VC.misc", "tieuChiII", VC_OLD.tieuChiII(x, y, z), A.VC.tieuChiII(x, y, z));
    cmp("VC.misc", "datAlarm", VC_OLD.datAlarm(x, y), A.VC.datAlarm(x, y));
    cmp("VC.misc", "tySoWowk", VC_OLD.tySoWowk(x, y), A.VC.tySoWowk(x, y));
    cmp("VC.misc", "chonDonVi", VC_OLD.chonDonViBienDo(x, y * 10, 16.5), A.VC.chonDonViBienDo(x, y * 10, 16.5));
    cmp("VC.misc", "nghiDaoCot", VC_OLD.nghiDaoCot(x, y * 10, 16.5), A.VC.nghiDaoCot(x, y * 10, 16.5));
    cmp("VC.misc", "rungNen", VC_OLD.rungNen(x, y, z), A.VC.rungNen(x, y, z));
    cmp("VC.misc", "nghiemThu", VC_OLD.nghiemThu(x, y), A.VC.nghiemThu(x, y));
  }
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});

test("2. readCell / cellNum trên mọi ô thật (kể cả chuỗi Excel)", () => {
  let strings = 0;
  const odd = ["", "-", "–", "2.4", "2,4", "36 °C", "9.5 A (dòng điện trên biến tần)", "1900-01-02 12:00:00", "2026-04-03", "12:30", "ngừng", "abc 12", null, undefined, NaN, Infinity, 0, "0"];
  for (const v of odd) cmp("readCell", `odd:${String(v)}`, OLD.readCell(v), A.readCell(v));
  for (const d of devices) for (const r of d.records) for (const v of r.values as unknown[]) {
    if (typeof v === "string") strings++;
    cmp("readCell", "cell", OLD.readCell(v), A.readCell(v));
    cmp("cellNum", "cell", OLD.cellNum(v), A.cellNum(v));
  }
  console.log("ô dạng chuỗi (Excel):", strings);
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});

test("3. readingMax / statusFor / recordAssessment trên MỌI bản ghi (theo kind)", () => {
  const perKind: Record<string, number> = {};
  for (let i = 0; i < devices.length; i++) {
    const od = devices[i], nd = newDevices[i];
    for (let j = 0; j < od.records.length; j++) {
      const or = od.records[j], nr = nd.records[j];
      const k = nr.kind as string;
      perKind[k] = (perKind[k] || 0) + 1;
      cmp(`readingMax[${k}]`, `${od.id}#${j}`, OLD.readingMax(or.values, or.extra), A.readingMax(nr.values, nr.extra));
      const rm = A.readingMax(nr.values, nr.extra);
      cmp(`statusFor[${k}]`, `${od.id}#${j}`, OLD.statusFor(light(od), rm.a, rm.t, rm.stopped, or.values), A.statusFor(nd, rm.a, rm.t, rm.stopped, nr.values));
      cmp(`recordAssessment[${k}]`, `${od.id}#${j}`, OLD.recordAssessment(light(od), or), A.recordAssessment(nd, nr));
    }
  }
  console.log("bản ghi đã so statusFor:", perKind);
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});

const SYNTH_MACHINES: any[] = [
  { type: "quat", powerKw: 500, speedRpm: 1480, foundation: "cung" },
  { type: "quat", powerKw: 200, speedRpm: 1480, foundation: "mem" },
  { type: "quat", powerKw: 200, speedRpm: 990, foundation: "chua_xac_dinh" },
  { type: "quat", powerKw: 150, speedRpm: 1480, foundation: "cung", standardOverride: "ISO_14694_2003_AMCA_204_20" },
  { type: "bom", powerKw: 90, speedRpm: 2960, foundation: "cung" },
  { type: "bom", powerKw: 400, speedRpm: 1480, foundation: "mem", foundationY: "cung" },
  { type: "bom", powerKw: 90, speedRpm: 2960, coupling: "lien_truc" },
  { type: "bom", powerKw: 90, speedRpm: 2960, pumpKind: "bun" },
  { type: "dong_co", powerKw: 45, speedRpm: 1480, foundation: "cung", shaftHeightMm: 315 },
  { type: "dong_co", powerKw: 12, speedRpm: 1480 },
  { type: "may_nghien", powerKw: 2300, speedRpm: 992, foundation: "cung", natFreqX: 30, natFreqY: 8 },
  { type: "hop_so", powerKw: 75, speedRpm: 300, coupling: "hop_so", vsd: "co", orientation: "dung" },
  { type: "bom", speedRpm: 1480 },
  { type: "quat", powerKw: 50, speedRpm: 100 },
  { type: "khac", powerKw: 30, speedRpm: 1480, meterValue: "peak", freqLowHz: 12 },
  { type: "may_nen_truc_vit", powerKw: 132, speedRpm: 2980 },
  { type: "tuabin_hoi", powerKw: 50000, speedRpm: 3000 },
];

test("4. standardPlan + vibrationLimitFor + wowkLimits (857 thiết bị thật + máy giả lập)", () => {
  const trial: [any, any][] = devices.map((d, i) => [d, newDevices[i]]);
  for (const [i, m] of SYNTH_MACHINES.entries()) {
    const base = { id: "S" + i, name: "giả lập " + i, area: "A", system: "S", machine: m, alertConfig: { vibration: 3, vibrationDanger: 6 }, records: [] };
    trial.push([structuredClone(base), structuredClone(base)]);
  }
  for (const [od, nd] of trial) {
    const group = od.id.startsWith("S") && od.name.startsWith("giả lập") ? "synthetic" : od.machine && Object.keys(od.machine).length ? "machine" : "no-machine";
    const po = OLD.standardPlan(od), pn = A.standardPlan(nd);
    const strip = (p: any) => ({ ...p, forPart: undefined, parts: ["motor", "machine"].map((x) => p.forPart(x)) });
    cmp(`standardPlan[${group}]`, od.id, strip(po), strip(pn));
    for (const part of ["motor", "machine"]) for (const dir of ["X", "Y"] as const) cmp(`vibrationLimitFor[${group}]`, `${od.id}/${part}${dir}`, OLD.vibrationLimitFor(light(od), part, dir, po), A.vibrationLimitFor(nd, part, dir, pn));
    cmp(`wowkLimits[${group}]`, od.id, OLD.wowkLimits(od.machine || {}), A.wowkLimits(nd.machine || {}));
    cmp(`wowkRow[${group}]`, od.id, OLD.wowkRow(od.machine || {}), A.wowkRow(nd.machine || {}));
  }
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});

function pickRecords(kind: string, dev: any, limit: number) {
  const dated = A.datedRecords(dev).filter((r: any) => r.kind === kind);
  if (!dated.length) return [];
  const idx = new Set<number>(limit > 4 ? dated.map((_: any, i: number) => i) : [dated.length - 1, Math.floor(dated.length / 2), 0, Math.max(0, dated.length - 2)]);
  return [...idx].slice(0, limit).map((i) => dated[i]);
}

test("5. analyzeRecord (kết luận thống nhất) — mẫu theo kind, kèm máy giả lập", () => {
  const perKind: Record<string, number> = {};
  const lvDist: Record<string, number> = {};
  let samples = 0;
  const run = (od: any, nd: any, r: any, kind: string, tag: string, history?: boolean) => {
    const histOld = OLD.datedRecords(od), histNew = A.datedRecords(nd);
    const idx = nd.records.indexOf(r);
    const ro = od.records[idx];
    // lịch sử cũ/mới tương ứng
    const ho = history ? histOld : undefined, hn = history ? histNew : undefined;
    const o = OLD.analyzeRecord(od, ro, ho ? { history: ho } : {});
    const n = A.analyzeRecord(nd, r, hn ? { history: hn } : {});
    cmp(`analyzeRecord[${kind}]`, `${tag}:${od.id}#${idx}`, o, n);
    cmp(`actionPlan[${kind}]`, `${tag}:${od.id}#${idx}`, OLD.actionPlan(o), A.actionPlan(n));
    perKind[kind] = (perKind[kind] || 0) + 1;
    lvDist[n.level] = (lvDist[n.level] || 0) + 1;
    samples++;
  };
  for (let i = 0; i < devices.length; i++) {
    const nd = newDevices[i], od = devices[i];
    for (const kind of ["WEEKLY", "MNK", "TBNT", "HISTORY_XLSX"]) {
      if (!nd._kinds.has(kind)) continue;
      for (const r of pickRecords(kind, nd, kind === "TBNT" || kind === "MNK" ? 12 : 3)) run(od, nd, r, kind, "real", true);
    }
  }
  // máy giả lập gắn lên thiết bị thật có nhiều lần đo (phủ các nhánh ISO 20816-3 / 10816-7 / 14694 / Wowk)
  const rich = newDevices.map((d, i) => ({ d, i })).filter(({ d }) => d.records.filter((r: any) => r.date && A.hasReading(r)).length >= 5).slice(0, 14);
  for (const m of SYNTH_MACHINES) for (const { d, i } of rich) {
    const od = structuredClone(devices[i]); od.machine = structuredClone(m);
    const nd = { ...d, machine: structuredClone(m) };
    const r = A.datedRecords(nd).at(-1);
    if (r) run(od, nd, r, nd._kinds.has("MNK") ? "MNK" : "WEEKLY", "synthetic");
  }
  // ngưỡng cấu hình khác mặc định
  OLD.setSettings({ baselineMin: 2, changeRatio: 0.15, tempRise: 5, requirePerson: false });
  for (const { d, i } of rich.slice(0, 6)) {
    const od = devices[i];
    const r = A.datedRecords(d).at(-1);
    if (!r) continue;
    const idx = d.records.indexOf(r);
    cmp("analyzeRecord[settings]", od.id, OLD.analyzeRecord(od, od.records[idx], { history: OLD.datedRecords(od) }), A.analyzeRecord(d, r, { history: A.datedRecords(d), settings: { baselineMin: 2, changeRatio: 0.15, tempRise: 5, requirePerson: false } }));
    samples++;
  }
  OLD.setSettings({});
  console.log("analyzeRecord: mẫu =", samples, perKind, "phân bố mức:", lvDist);
  assert.ok(samples >= 300, "cần ≥ 300 mẫu analyzeRecord, có " + samples);
  assert.equal(mismatches.length, 0, mismatches.slice(0, 15).join("\n"));
});

test("6. qualityCheck + bearingValues trên toàn bộ bản ghi thật", () => {
  let n = 0;
  for (let i = 0; i < devices.length; i++) {
    const od = devices[i], nd = newDevices[i];
    const histO = OLD.datedRecords(od), histN = A.datedRecords(nd);
    const f1x = nd.machine?.speedRpm ? nd.machine.speedRpm / 60 : null;
    histN.forEach((r: any, j: number) => {
      const ro = histO[j];
      const qo = OLD.qualityCheck(od, ro, histO[j - 1], f1x), qn = A.qualityCheck(nd, r, histN[j - 1], f1x);
      cmp(`qualityCheck[${r.kind}]`, `${od.id}#${j}`, qo, qn);
      for (const [bo, bn] of A.BEARINGS.map((b, k) => [OLD.BEARINGS[k], b])) cmp(`bearingValues[${r.kind}]`, `${od.id}#${j}${bn.key}`, OLD.bearingValues(qo, bo), A.bearingValues(qn, bn));
      n++;
    });
  }
  console.log("qualityCheck: bản ghi =", n);
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});

test("7. Mill: MillAnalysis (records/points/iso/dayPair/assessment…) trên bản ghi MILL thật", () => {
  const MA = OLD.MillAnalysis;
  let calls = 0;
  for (let i = 0; i < devices.length; i++) {
    const od = devices[i], nd = newDevices[i];
    if (!nd._kinds.has("MILL")) continue;
    const dates = [...new Set(nd.records.filter((r: any) => r.kind === "MILL").map((r: any) => r.date))].sort() as string[];
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    for (const m of months) cmp("Mill.records", `${od.id}${m}`, MA.records(od, m), A.millRecords(nd, m));
    const from = dates[0], to = dates.at(-1)!;
    cmp("Mill.rangeRecords", od.id, MA.rangeRecords(od, from, to), A.rangeRecords(nd, from, to));
    cmp("Mill.rangeDays", od.id, MA.rangeDays(from, to), A.rangeDays(from, to));
    const rsO = MA.rangeRecords(od, from, to), rsN = A.rangeRecords(nd, from, to);
    for (const metric of ["v", "d", "t"]) for (const axis of ["max", "X", "Y", "Z"]) {
      cmp("Mill.bearingSeries", `${od.id}${metric}${axis}`, MA.bearingSeries(rsO, metric, axis), A.millBearingSeries(rsN, metric, axis));
      for (let b = 1; b <= 6; b++) cmp("Mill.points", `${od.id}${metric}${axis}${b}`, MA.points(rsO, b, metric, axis), A.millPoints(rsN, b, metric, axis));
    }
    for (const r of rsN) cmp("Mill.stopped", r.id ?? "", MA.stopped(r), A.millStopped(r));
    const sample = [dates[0], dates[Math.floor(dates.length / 2)], dates.at(-1)!, A.addDays(dates.at(-1)!, 2)];
    for (const day of sample) {
      cmp("Mill.worstBearing", od.id + day, MA.worstBearing(od, day), A.millWorstBearing(nd, day));
      for (let b = 1; b <= 6; b++) {
        cmp("Mill.dayPair", `${od.id}${day}${b}`, MA.dayPair(od, day, b), A.millDayPair(nd, day, b));
        cmp("Mill.referencePoint", `${od.id}${day}${b}`, MA.referencePoint(od, day, b), A.millReferencePoint(nd, day, b));
        for (const rms of [true, false]) {
          const o = MA.assessment(od, day, b, rms), n = A.millAssessment(nd, day, b, rms);
          cmp("Mill.assessment", `${od.id}${day}${b}${rms}`, o, n);
          calls++;
        }
      }
    }
    for (const mach of [nd.machine, { ...nd.machine, powerKw: 14 }, { ...nd.machine, powerKw: null, type: "" }, { type: "bom", powerKw: 200 }, { ...nd.machine, foundation: "mem", foundationY: "cung" }, { ...nd.machine, speedRpm: 50 }]) {
      const o2 = { ...structuredClone(od), machine: mach }, n2 = { ...nd, machine: mach };
      for (let b = 1; b <= 6; b++) for (const v of [0, 1, 2.3, 3, 4.5, 6, 7.1, 9, 20]) for (const rms of [true, false]) cmp("Mill.iso", `${od.id}${b}${v}${rms}${JSON.stringify(mach)}`, MA.iso(v, o2, b, rms), A.millIso(v, n2, b, rms));
    }
  }
  for (const v of [null, 0, 2.3, 2.31, 4.5, 7.1, 7.2]) cmp("Mill.zone", String(v), MA.zone(v), A.millZoneFixed(v));
  for (const v of ["", "1.5", "1,5", "-1", ".5", "5.", " 3 ", null, undefined, 0, "abc"]) cmp("Mill.num", String(v), MA.num(v), A.millNum(v));
  for (const t of ["Máy dự phòng", "ngừng sửa chữa", "Máy không vận hành", "Gối #1 TOLERABLE", ""]) cmp("Mill.stopped.text", t, MA.stopped({ note: t }), A.millStopped({ note: t }));
  assert.deepEqual([...A.MILL_FIELD_KEYS].sort(), Array.from(OLD.MillShift.fields as any[], (f: any) => f.key).sort());
  cmp("Mill.fields", "count", OLD.MillShift.fields.length, A.MILL_FIELD_KEYS.length);
  for (const ar of ["Máy nghiền S1", "MILL S2", "Thải xỉ", "máy nghiền S2"]) assert.equal(A.millUnitForArea(ar), OLD.MillShift.unitForArea(ar));
  console.log("Mill.assessment cuộc gọi:", calls);
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});

test("8. Phiếu ngoài danh mục: externalAnalyze + ewAnalyze (cùng dữ liệu nhập)", () => {
  const base = { name: "Bơm thử", location: "Vị trí", date: "2026-11-01", time: "10:00", person: "NV", meterValue: "rms", condition: "stable", mounting: "stud", meter: "CSI", calibrationDate: "2026-01-01", freqLowHz: "2", freqHighHz: "1000", xAxis: "ngang", measureScope: "both", motorBearings: "2", machineBearings: "2" };
  const forms: any[] = [];
  for (const type of ["quat", "bom", "dong_co", "may_nghien", "khac", ""]) for (const [powerKw, speedRpm] of [["15", "1480"], ["90", "2960"], ["400", "1480"], ["", ""]]) for (const found of ["chua_xac_dinh", "cung", "mem"]) forms.push({ ...base, type, powerKw, speedRpm, foundation: found, motorA: "10", motorB: "10", motorC: "10", DC_KT_vx: "2.1", DC_KT_vy: "1.6", DC_KT_dx: "30", DC_KT_dy: "25", DC_CT_vx: "3.2", DC_CT_vy: "2.1", QB_KT_vx: "4.8", QB_KT_vy: "3", QB_CT_vx: "7.5", QB_CT_vy: "5.5", QB_CT_t: "62", spectrumPoint: "QB_CT", oneX: "6", twoX: "1", axial: "1", harmonics: "yes", envelope: "bearing", resonance: "yes" });
  forms.push({ ...base, type: "bom", powerKw: "90", speedRpm: "2960", foundation: "cung", measureScope: "machine", machineBearings: "1", QB_KT_vx: "3.9", QB_KT_vy: "2", extraCount: "1", extra_0_name: "Hộp số", extra_0_x: "2", spectrumPoint: "QB_KT", oneX: "1", twoX: "0.9", axial: "0.8" });
  forms.push({ ...base, type: "bom", powerKw: "90", speedRpm: "2960", meterValue: "peak", QB_KT_vx: "3.9" }, { ...base, type: "bom", powerKw: "90", speedRpm: "2960", condition: "transient", QB_KT_vx: "3.9" }, { ...base, type: "bom", powerKw: "90", QB_KT_vx: "0", QB_KT_vy: "0", motorA: "0", motorB: "0", motorC: "0" });
  const bad = [{ ...base, name: "" }, { ...base, date: "" }, { ...base, QB_KT_vx: "3,5" }, { ...base }, { ...base, speedRpm: "40000", QB_KT_vx: "1" }];
  const errOf = (f: () => any) => { try { f(); return "OK"; } catch (e: any) { return "ERR:" + e.message; } };
  for (const [i, f] of forms.entries()) {
    const o = OLD.externalAnalyze(structuredClone(f)), n = A.externalAnalyze(structuredClone(f));
    cmp("externalAnalyze", `f${i}`, { ...o, device: undefined, record: undefined }, { ...n, device: undefined, record: undefined });
    cmp("externalAnalyze.device", `f${i}`, { ...o.device, records: undefined, labels: undefined, points: undefined, active: undefined, alertConfig: undefined }, { ...n.device, records: undefined, alertConfig: undefined });
  }
  for (const [i, f] of bad.entries()) cmp("externalAnalyze.errors", `bad${i}`, errOf(() => OLD.externalAnalyze(structuredClone(f))), errOf(() => A.externalAnalyze(structuredClone(f))));
  const ew: any[] = [];
  const rows = A.wowkTable().map((r: any) => r.ma);
  for (const row of [...rows, ""]) for (const [rpm, mode] of [["1480", "order"], ["", "order"], ["1480", "fft"]]) ew.push({ name: "T", location: "L", date: "2026-11-01", rpm, row, freqMode: mode, order: "1", freq: mode === "fft" ? "24.7" : "", peak: "5.1", meter: "x", mount: "y", bearingCount: "2", p0_v: "5.2", p0_d: "30", p0_a: "0.5", p0_base: "2", p1_v: "3", p3_v: "4", p3_t: "55", comparable: true, evidence: ["radial", "axial", "harmonics", "bearing", "resonance", ""][ew.length % 6] });
  for (const [i, f] of ew.entries()) cmp("ewAnalyze", `e${i}`, OLD.ewAnalyze(structuredClone(f)), A.ewAnalyze(structuredClone(f)));
  for (const [i, f] of ew.entries()) cmp("ewLevel", `e${i}`, OLD.ewLevel(OLD.ewAnalyze(structuredClone(f))), A.ewLevel(A.ewAnalyze(structuredClone(f))));
  for (const f of [{ name: "" }, { name: "a", date: "2026-01-01" }, { name: "a", date: "2026-01-01", p0_v: "1,2" }]) cmp("ewAnalyze.errors", JSON.stringify(f), errOf(() => OLD.ewAnalyze(f)), errOf(() => A.ewAnalyze(f)));
  console.log("phiếu ngoài danh mục: ISO", forms.length, "+ Wowk", ew.length);
  assert.equal(mismatches.length, 0, mismatches.slice(0, 10).join("\n"));
});
