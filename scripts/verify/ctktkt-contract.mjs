// Test "hợp đồng" cho API KTKT: khoá lại đúng JSON mà mỗi API GET trả về trên một bộ dữ liệu mẫu cố định,
// để mọi bước chuyển đổi (hook TanStack, API trả ok(), SQL → Prisma) phải ra KẾT QUẢ Y HỆT.
//
//   npm run test:ctktkt:contract              # so với ảnh chụp chuẩn (mặc định)
//   npm run test:ctktkt:contract -- --seed    # đổ (lại) dữ liệu mẫu vào DB dev rồi so
//   npm run test:ctktkt:contract -- --record  # GHI ĐÈ ảnh chụp chuẩn — chỉ làm trên code CŨ, trước khi chuyển đổi
//
// Cần dev server chạy ở BASE (mặc định http://localhost:3030) và DB dev local đã có bảng ctktkt_*
// (prisma/manual/add-ctktkt.sql, add-ctktkt-corrections.sql).
//
// An toàn: chỉ chạy với DB local; dữ liệu mẫu dùng id ≥ 900000 và chỉ xoá/ghi đúng các dòng đó; từ chối đổ
// nếu bảng đã có dữ liệu khác (để ảnh chụp không lẫn dữ liệu dev thật).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { assertDevDatabase, assertLocalBase, fail, loadDevEnv } from "./_safety.mjs";
import { CTKTKT_SAMPLE_2DAYS } from "../../tests/ctktkt/fixtures/ctktkt-sample-data.ts";
import { BCSX_COAL_STOCK_24H_CODE } from "../../modules/ctktkt/lib/ctktkt-bcsx-link.ts";

loadDevEnv();
assertDevDatabase();
const args = process.argv.slice(2);
const base = assertLocalBase(args.find(a => a.startsWith("http")) ?? "http://localhost:3030");
const SNAPSHOT = path.join("tests", "ctktkt", "contracts", "api-snapshots.json");
const SEED_ID = 900000;
const SEEDED_TABLES = ["daily_inputs", "shift_readings", "operating_events", "water_shift_leaders", "water_shift_logs", "chemical_usage_logs", "ppa_heat_rate_daily", "measurements"];
const STAMP = "2026-09-20 08:00:00";

// Mã nhập tay của bảng Dữ liệu các tháng (daily-production-table.tsx) — gồm cả nguồn giờ luỹ kế F, L, CS, CT, CU.
const DAILY_CODES = "B C F H I L X AE AF AJ AR AT CJ CX BN BQ BR CN BZ CA CC CD CE CF CM CQ CR CS CT CU CV CW".split(" ");

function seedRows() {
  let id = SEED_ID;
  const rows = Object.fromEntries(SEEDED_TABLES.map(t => [t, []]));
  const days = [];
  for (let d = new Date("2026-08-28T00:00:00Z"); d <= new Date("2026-09-18T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  days.forEach((date, di) => DAILY_CODES.forEach((code, ci) => {
    // Giá trị cố định, đủ dạng: số thập phân, số nguyên, chuỗi rỗng (ô đã xoá), ghi chú, văn bản (CW).
    const value = code === "CW" ? (di % 3 ? "Bình thường" : "") : ci % 11 === 5 && di % 4 === 1 ? "" : String(((di * 37 + ci * 113) % 9000) / 10 + (["F", "L"].includes(code) ? 0 : 1));
    rows.daily_inputs.push({ id: id++, operating_date: date, field_code: code, value: ["F", "L"].includes(code) ? String(18 + (di % 7)) : value, note: ci === 3 && di % 5 === 0 ? `Ghi chú mẫu ${date}` : "", updated_at: STAMP });
  }));
  for (const date of days.slice(-5)) for (const [code, v] of [["GRID_RECEIVE_S1", "12.5"], ["GRID_RECEIVE_S2", "0"], [BCSX_COAL_STOCK_24H_CODE, "312450.75"]])
    rows.daily_inputs.push({ id: id++, operating_date: date, field_code: code, value: v, note: "", updated_at: STAMP });
  for (const day of Object.values(CTKTKT_SAMPLE_2DAYS)) {
    for (const e of day.manualEntries) rows.daily_inputs.push({ id: id++, operating_date: day.operatingDate, field_code: `KTKT:${e.cell}`, value: e.value, note: "", updated_at: STAMP });
    for (const r of day.shiftReadings) rows.shift_readings.push({ id: id++, operating_date: day.operatingDate, unit: r.unit, time_slot: r.timeSlot, metric: r.metric, value: r.value, updated_at: STAMP });
  }
  rows.operating_events.push(
    { id: id++, operating_date: "2026-09-17", unit: "S1", start_at: "2026-09-17T02:15", end_at: "2026-09-17T05:40", event_type: 1, description: "Ngừng sự cố mẫu", updated_at: STAMP },
    { id: id++, operating_date: "2026-09-17", unit: "S2", start_at: "2026-09-17T10:00", end_at: "", event_type: 2, description: "", updated_at: STAMP });
  rows.water_shift_leaders.push({ id: id++, name: "Trưởng ca Mẫu A", is_active: 1, display_order: 1, created_at: STAMP }, { id: id++, name: "Trưởng ca Mẫu B", is_active: 0, display_order: 2, created_at: STAMP });
  ["2026-09-16", "2026-09-17"].forEach((date, di) => ["06h00", "14h00", "22h00"].forEach((shift, si) => {
    const k = di * 3 + si + 1;
    rows.water_shift_logs.push({ id: id++, log_date: date, shift_time: shift, shift_team: `Kíp ${si + 1}`, shift_leader: si % 2 ? "Trưởng ca Mẫu B" : "Trưởng ca Mẫu A",
      elec_rec_s1: 1000 + k * 31.5, elec_rec_s2: 900 + k * 27.25, elec_gen_s1: 240 + k, elec_gen_s2: si === 2 ? 0 : 230 + k,
      water_rec_s1: 5000 + k * 12.75, water_rec_s2: 4800 + k * 10.5, water_used_s1: 40 + k, water_used_s2: 38 + k, water_ratio_s1: 0.07, water_ratio_s2: 0.0812,
      condenser_rec_s1: 2000 + k * 3, condenser_rec_s2: 2100 + k * 2, condenser_used_s1: 12 + k, condenser_used_s2: 11 + k,
      resin_water_s1_24h: si === 0 ? 55.5 : 0, resin_water_s2_24h: si === 0 ? 49 : 0, note: k === 2 ? "Ghi chú ca" : "",
      water_adjustment_s1: k === 3 ? 2.5 : null, water_adjustment_s2: null, condenser_adjustment_s1: null, condenser_adjustment_s2: k === 4 ? 1.25 : null, updated_at: STAMP });
  }));
  const chem = (date, code, material, name, quantity, extra = {}) => ({ id: id++, usage_date: date, chemical_code: code, material_code: material, chemical_name: name, unit: "Tấn", quantity, purpose: "Sử dụng cho sản xuất", plant_unit: "Chung", reference: "", entered_by_user_id: "contract-seed", entered_by_name: "Người nhập mẫu", entered_by_position: "Trưởng kíp Lò - Máy", updated_by_user_id: null, updated_by_name: "", updated_by_position: "", deleted_at: null, deleted_by_user_id: null, deleted_by_name: "", deleted_by_position: "", source_key: "", created_at: STAMP, updated_at: STAMP, ...extra });
  rows.chemical_usage_logs.push(chem("2026-09-16", "PAC", "1.61.86.566.VIE.00.000", "PAC lỏng", 1.25), chem("2026-09-17", "PAC", "1.61.86.566.VIE.00.000", "PAC lỏng", 0.875, { reference: "PCT-01" }),
    chem("2026-09-17", "NH3", "1.61.10.001", "Amoniac", 3.5, { deleted_at: STAMP, deleted_by_user_id: "contract-seed", deleted_by_name: "Người xoá mẫu", deleted_by_position: "Trưởng ca" }));
  const src = n => JSON.stringify({ grossS1: [100 + n, 200 + n], netS1: [95 + n, 190 + n], grossS2: [110 + n, 210 + n], netS2: [104 + n, 199 + n] });
  rows.ppa_heat_rate_daily.push(
    { id: id++, operating_date: "2026-09-16", source_data: src(1), source_files: '["mau-16.xlsx"]', gross_s1_kwh: "14610000", net_s1_kwh: "13560000", gross_s2_kwh: "0", net_s2_kwh: "0", ppa_plant: "10234.32", ppa_s1: "10234.32", ppa_s2: "", note_s1: "Ghi chú S1", note_s2: "", updated_at: STAMP },
    { id: id++, operating_date: "2026-09-17", source_data: src(2), source_files: "[]", gross_s1_kwh: "14590000", net_s1_kwh: "13530000", gross_s2_kwh: "14200000", net_s2_kwh: "13100000", ppa_plant: "10190.5", ppa_s1: "10180.1", ppa_s2: "10201.7", note_s1: "", note_s2: "S2 khởi động", updated_at: STAMP });
  rows.measurements.push({ id: id++, metric_code: "HR", metric_name: "Suất hao nhiệt mẫu", period: "2026-09", actual: "10746.39", limit_value: "10500", note: "", created_at: STAMP });
  return rows;
}

async function seed() {
  const url = new URL(process.env.DATABASE_URL); url.search = "";
  const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
  try {
    for (const t of SEEDED_TABLES) {
      const other = Number((await c.query(`SELECT count(*) FROM public.ctktkt_${t} WHERE id < $1`, [SEED_ID])).rows[0].count);
      if (other > 0 && !args.includes("--allow-existing")) fail(`bảng ctktkt_${t} đã có ${other} dòng không phải dữ liệu mẫu — ảnh chụp sẽ lẫn dữ liệu dev. Dùng --allow-existing nếu chắc chắn.`);
    }
    const rows = seedRows();
    await c.query("BEGIN");
    for (const t of SEEDED_TABLES) {
      await c.query(`DELETE FROM public.ctktkt_${t} WHERE id >= $1`, [SEED_ID]);
      for (const row of rows[t]) {
        const cols = Object.keys(row);
        await c.query(`INSERT INTO public.ctktkt_${t} (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map(k => row[k]));
      }
    }
    await c.query("COMMIT");
    console.log("Đã đổ dữ liệu mẫu:", Object.entries(rows).map(([t, r]) => `${t}=${r.length}`).join(", "));
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { await c.end(); }
}

// Các API GET người dùng đang gọi (đếm từ component + log nginx). Thêm vào đây khi chuyển đổi API mới.
const ENDPOINTS = [
  "ctktkt-report?period=2026-09&date=2026-09-17&scope=daily-links",
  "ctktkt-report?period=2026-09&from=2026-09-01&to=2026-09-16&scope=daily-links",
  "ctktkt-report?period=2026-09&date=2026-09-17&scope=operating-hours",
  "ctktkt-report?period=2026-09&date=2026-09-17&scope=stored",
  "ctktkt-report?period=2026-09",
  "daily-inputs?period=2026-09",
  "daily-inputs?period=2026-09&date=2026-09-17&scope=non-ktkt",
  "daily-inputs?period=2026-09&from=2026-09-01&to=2026-09-18&scope=non-ktkt",
  "shift-readings?date=2026-09-17",
  "shift-readings?date=2026-09-18",
  "operating-events?date=2026-09-17",
  "water-report?month=2026-09",
  "water-report/leaders",
  "chemical-usage?month=2026-09",
  "chemical-usage?month=2026-13",
  "chemical-usage",
  "ppa-heat-rate?period=2026-09&from=2026-09-01&to=2026-09-30",
  "ppa-heat-rate?period=2026-09&includeSource=1",
  "measurements?period=2026-09",
  "correction-requests",
  "google-mirror/status",
  "permissions",
];

async function sessionCookie() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true, lockedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, accessMode: true, employeeId: true } });
  await prisma.$disconnect();
  if (!user) fail("DB dev không có tài khoản ADMIN đang hoạt động.");
  const value = await encode({ token: { sub: user.id, ...user }, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  return `authjs.session-token=${value}`;
}

async function capture(cookie) {
  const out = {};
  for (const ep of ENDPOINTS) {
    const res = await fetch(new URL(`/api/ctktkt/${ep}`, base), { headers: { cookie } });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = { nonJson: text.slice(0, 200) }; }
    out[ep] = { status: res.status, body };
  }
  return out;
}

function diff(a, b, at = "", acc = []) {
  if (acc.length >= 12) return acc;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { acc.push(`${at}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`); return acc; }
  if (a && typeof a === "object") {
    if (Array.isArray(a) && a.length !== b.length) acc.push(`${at}: độ dài ${a.length} ≠ ${b.length}`);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}/${k}`, acc);
  } else if (a !== b) acc.push(`${at}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`);
  return acc;
}

if (args.includes("--seed")) await seed();
const cookie = await sessionCookie();
const actual = await capture(cookie);
if (args.includes("--record")) {
  mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, JSON.stringify(actual, null, 1) + "\n");
  const bad = Object.entries(actual).filter(([, v]) => v.status >= 500);
  console.log(`Đã ghi ảnh chụp chuẩn ${SNAPSHOT}: ${ENDPOINTS.length} API.` + (bad.length ? ` CẢNH BÁO 5xx: ${bad.map(([k]) => k).join(", ")}` : ""));
  for (const [k, v] of Object.entries(actual)) console.log(`  ${v.status}  ${k}  ${JSON.stringify(v.body).length} byte`);
  process.exit(0);
}
if (!existsSync(SNAPSHOT)) fail(`chưa có ảnh chụp chuẩn ${SNAPSHOT} — chạy --seed --record trên code CŨ trước.`);
const expected = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
let failed = 0;
for (const ep of ENDPOINTS) {
  if (!expected[ep]) { console.log(`?  ${ep}: chưa có trong ảnh chụp chuẩn`); failed++; continue; }
  const d = diff(expected[ep], actual[ep]);
  if (d.length) { failed++; console.log(`✗  ${ep}`); for (const line of d) console.log(`     ${line}`); } else console.log(`✓  ${ep}`);
}
console.log(failed ? `KẾT QUẢ: ${failed}/${ENDPOINTS.length} API LỆCH hợp đồng` : `KẾT QUẢ: ${ENDPOINTS.length}/${ENDPOINTS.length} API khớp hợp đồng`);
process.exit(failed ? 1 : 0);
