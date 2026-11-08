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

// Mã nhập tay của bảng Dữ liệu các tháng (daily-production-table.tsx) — gồm cả nguồn giờ luỹ kế F, L, CS, CT, CU — và mã PMIS DA…DH.
const DAILY_CODES = "B C F H I L X AE AF AJ AR AT CJ CX BN BQ BR CN BZ CA CC CD CE CF CM CQ CR CS CT CU CV CW DA DB DC DD DE DF DG DH".split(" ");

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
  // Mỗi bảng một dải id cố định (900000 + 20000 × thứ tự bảng): thêm dòng mẫu vào bảng này không làm dịch id bảng khác.
  SEEDED_TABLES.forEach((t, ti) => rows[t].forEach((row, i) => { row.id = SEED_ID + ti * 20000 + i; }));
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

// ---- Hợp đồng GHI: một kịch bản thêm/sửa/xoá cố định chạy trên dữ liệu mẫu; ghi phản hồi + trạng thái sau mỗi bước.
// Chạy trên code CŨ với --writes --record, rồi trên code MỚI với --writes để so. Luôn đổ lại dữ liệu mẫu trước và sau.
const WRITE_SNAPSHOT = path.join("tests", "ctktkt", "contracts", "api-write-snapshots.json");
const shift = (logDate, shiftTime, k, extra = {}) => ({ logDate, shiftTime, shiftTeam: `Kíp ${k}`, shiftLeader: "Trưởng ca Mẫu A",
  elecRecS1: 1300.5 + k, elecRecS2: 1180.25 + k, waterRecS1: 5100.75 + k * 3, waterRecS2: 4900 + k * 2, condenserRecS1: 2030 + k, condenserRecS2: 2120 + k,
  resinWaterS1_24h: shiftTime === "06h00" ? 60 : 0, resinWaterS2_24h: shiftTime === "06h00" ? 52 : 0, note: `Ca mẫu ${k}`, ...extra });
const WRITE_SCENARIOS = {
  "water-report": [
    { step: "thêm 1 ca", method: "POST", path: "water-report", json: { shift: shift("2026-09-18", "06h00", 1) }, after: ["water-report?month=2026-09"] },
    { step: "sửa có changedFields (elecRecS1 phải bị bỏ qua)", method: "POST", path: "water-report", json: { shift: { logDate: "2026-09-17", shiftTime: "14h00", note: "Sửa ghi chú", waterRecS1: 5100, elecRecS1: 99999 }, changedFields: ["note", "waterRecS1"] }, after: ["water-report?month=2026-09"] },
    { step: "thêm nhiều ca + hiệu chỉnh", method: "POST", path: "water-report", json: { shifts: [shift("2026-09-18", "14h00", 2, { waterAdjustmentS1: 3.5 }), shift("2026-09-18", "22h00", 3)] }, after: ["water-report?month=2026-09"] },
    { step: "giờ giao ca sai", method: "POST", path: "water-report", json: { shift: shift("2026-09-19", "07h00", 4) } },
    { step: "hiệu chỉnh âm", method: "POST", path: "water-report", json: { shift: shift("2026-09-19", "06h00", 5, { waterAdjustmentS1: -1 }) } },
    { step: "không có ca", method: "POST", path: "water-report", json: {} },
    { step: "xoá theo ngày + ca", method: "DELETE", path: "water-report?logDate=2026-09-18&shiftTime=14h00", after: ["water-report?month=2026-09"] },
    { step: "xoá thiếu tham số", method: "DELETE", path: "water-report" },
    { step: "thêm Trưởng ca", method: "POST", path: "water-report/leaders", json: { name: "Trưởng ca Mẫu C", displayOrder: 3 }, after: ["water-report/leaders"] },
    { step: "Trưởng ca trống", method: "POST", path: "water-report/leaders", json: { name: "  " } },
    { step: "xoá Trưởng ca theo tên", method: "DELETE", path: `water-report/leaders?name=${encodeURIComponent("Trưởng ca Mẫu C")}`, after: ["water-report/leaders"] },
    { step: "xoá Trưởng ca thiếu tham số", method: "DELETE", path: "water-report/leaders" },
    { step: "tải lên: quét sheet (file xuất từ chính web)", method: "POST", path: "water-report/upload", upload: { action: "scan" } },
    { step: "tải lên: nạp dữ liệu", method: "POST", path: "water-report/upload", upload: { action: "import" }, after: ["water-report?month=2026-09", "water-report?month=2026-10"] },
    { step: "tải lên: không có file", method: "POST", path: "water-report/upload", form: { action: "scan" } },
  ],
  // Dữ liệu ngày (PMIS, Dữ liệu các tháng, đồng bộ QLKT). B, C, H… tự liên kết từ Chỉ tiêu KTKT nên bị chặn khi ghi.
  "daily-inputs": [
    { step: "lưu số (dấu phẩy) + ghi chú + chữ CW + 'không chỉnh'", method: "POST", path: "daily-inputs", json: { period: "2026-09", entries: [
      { operatingDate: "2026-09-17", fieldCode: "F", value: "23,5", note: "" }, { operatingDate: "2026-09-17", fieldCode: "DA", value: "101.25", note: "Ghi chú PMIS" },
      { operatingDate: "2026-09-17", fieldCode: "CW", value: "Chạy 1 lò", note: "" }, { operatingDate: "2026-09-16", fieldCode: "CX", value: "Không chỉnh", note: "" }] },
      after: ["daily-inputs?period=2026-09&date=2026-09-17&scope=non-ktkt", "daily-inputs?period=2026-09&date=2026-09-16&scope=non-ktkt"] },
    { step: "xoá ô (giá trị và ghi chú rỗng)", method: "POST", path: "daily-inputs", json: { period: "2026-09", entries: [{ operatingDate: "2026-09-17", fieldCode: "DA", value: "", note: "" }] },
      after: ["daily-inputs?period=2026-09&date=2026-09-17&scope=non-ktkt"] },
    { step: "mã tự liên kết KTKT (B)", method: "POST", path: "daily-inputs", json: { period: "2026-09", entries: [{ operatingDate: "2026-09-17", fieldCode: "B", value: "1", note: "" }] } },
    { step: "mã không cho phép", method: "POST", path: "daily-inputs", json: { period: "2026-09", entries: [{ operatingDate: "2026-09-17", fieldCode: "ZZZ", value: "1", note: "" }] } },
    { step: "ngày tương lai", method: "POST", path: "daily-inputs", json: { period: "2099-01", entries: [{ operatingDate: "2099-01-01", fieldCode: "F", value: "1", note: "" }] } },
    { step: "ngày khác kỳ", method: "POST", path: "daily-inputs", json: { period: "2026-08", entries: [{ operatingDate: "2026-09-17", fieldCode: "F", value: "1", note: "" }] } },
    { step: "giá trị chữ ở ô số", method: "POST", path: "daily-inputs", json: { period: "2026-09", entries: [{ operatingDate: "2026-09-17", fieldCode: "F", value: "mười", note: "" }] } },
    { step: "kỳ sai định dạng", method: "POST", path: "daily-inputs", json: { period: "09/2026", entries: [] } },
    { step: "JSON hỏng", method: "POST", path: "daily-inputs", raw: "{không phải json", headers: { "Content-Type": "application/json" } },
    { step: "không phải JSON (415)", method: "POST", path: "daily-inputs", raw: "period=2026-09", headers: { "Content-Type": "text/plain" } },
    { step: "đọc: khoảng sai", method: "GET", path: "daily-inputs?period=2026-13" },
    { step: "đọc: scope lạ", method: "GET", path: "daily-inputs?period=2026-09&scope=khac" },
  ],
  // Suất hao nhiệt PPA: lưu 48 điểm nửa giờ/ngày, ghi chú + công suất khả dụng + tình hình vận hành, Google Sheet (chưa cấu hình ở dev).
  "ppa": [
    { step: "lưu ngày mới đủ 48 điểm", method: "POST", path: "ppa-heat-rate", json: { operatingDate: "2026-09-15", sourceFiles: ["s1.xlsx", "s2.xlsx"], noteS1: "Ghi chú S1 mẫu", noteS2: "",
      source: Object.fromEntries([["grossS1", 300000], ["netS1", 282000], ["grossS2", 295000], ["netS2", 277500]].map(([k, base]) => [k, Array.from({ length: 48 }, (_, i) => base + (i % 6) * 125.5)])) },
      after: ["ppa-heat-rate?period=2026-09&from=2026-09-01&to=2026-09-30", "ppa-heat-rate?period=2026-09&includeSource=1"] },
    { step: "ghi đè ngày có sẵn", method: "POST", path: "ppa-heat-rate", json: { operatingDate: "2026-09-16", sourceFiles: [], noteS1: "", noteS2: "Đè ghi chú",
      source: Object.fromEntries(["grossS1", "netS1", "grossS2", "netS2"].map((k, j) => [k, Array.from({ length: 48 }, (_, i) => 280000 - j * 9000 + i * 10)])) },
      after: ["ppa-heat-rate?period=2026-09&from=2026-09-01&to=2026-09-30"] },
    { step: "thiếu điểm (47)", method: "POST", path: "ppa-heat-rate", json: { operatingDate: "2026-09-15", source: { grossS1: Array(47).fill(1), netS1: Array(48).fill(1), grossS2: Array(48).fill(1), netS2: Array(48).fill(1) } } },
    { step: "điểm âm", method: "POST", path: "ppa-heat-rate", json: { operatingDate: "2026-09-15", source: { grossS1: Array(48).fill(-1), netS1: Array(48).fill(1), grossS2: Array(48).fill(1), netS2: Array(48).fill(1) } } },
    { step: "ngày sai", method: "POST", path: "ppa-heat-rate", json: { operatingDate: "15/09/2026", source: { grossS1: Array(48).fill(1), netS1: Array(48).fill(1), grossS2: Array(48).fill(1), netS2: Array(48).fill(1) } } },
    { step: "đọc: tháng sai", method: "GET", path: "ppa-heat-rate?period=2026-13" },
    { step: "ghi chú + công suất khả dụng + tình hình vận hành", method: "POST", path: "ppa-heat-rate/notes", json: { entries: [
      { operatingDate: "2026-09-17", noteS1: "Đánh giá S1", noteS2: "Đánh giá S2", eventS1: "Ngừng 2 giờ", eventS2: "", availableCapacityS1Mw: "612,5", availableCapacityS2Mw: 600 },
      { operatingDate: "2026-09-14", noteS1: "Ngày chưa có số liệu", noteS2: "" }] },
      after: ["ppa-heat-rate?period=2026-09&from=2026-09-01&to=2026-09-30", "daily-inputs?period=2026-09&date=2026-09-17&scope=non-ktkt"] },
    { step: "Google Sheet: xem trước (máy chủ chưa cấu hình)", method: "POST", path: "google-sheet-sync", json: { operatingDate: "2026-09-17", action: "preview" } },
    { step: "Google Sheet: đồng bộ khi chưa cấu hình (503)", method: "POST", path: "google-sheet-sync", json: { operatingDate: "2026-09-17", action: "sync" } },
    { step: "xoá công suất + tình hình (giá trị rỗng)", method: "POST", path: "ppa-heat-rate/notes", json: { entries: [{ operatingDate: "2026-09-17", noteS1: "Đánh giá S1", noteS2: "", eventS1: "", availableCapacityS1Mw: "" }] },
      after: ["daily-inputs?period=2026-09&date=2026-09-17&scope=non-ktkt"] },
    { step: "ghi chú: ngày trùng", method: "POST", path: "ppa-heat-rate/notes", json: { entries: [{ operatingDate: "2026-09-17" }, { operatingDate: "2026-09-17" }] } },
    { step: "ghi chú: ngày tương lai", method: "POST", path: "ppa-heat-rate/notes", json: { entries: [{ operatingDate: "2099-01-01", noteS1: "x" }] } },
    { step: "ghi chú: công suất quá 1.000 MW", method: "POST", path: "ppa-heat-rate/notes", json: { entries: [{ operatingDate: "2026-09-17", availableCapacityS1Mw: 1200 }] } },
    { step: "Google Sheet: xem trước khi thiếu công suất S1", method: "POST", path: "google-sheet-sync", json: { operatingDate: "2026-09-17", action: "preview" } },
    { step: "Google Sheet: thao tác lạ", method: "POST", path: "google-sheet-sync", json: { operatingDate: "2026-09-17", action: "xoa" } },
  ],
  // Báo cáo sản xuất: số liệu nửa giờ, sự kiện vận hành, than tồn 24h, nạp 2 file S1/S2 (file xuất từ chính web), file lệnh điều độ (chỉ nhánh lỗi).
  "bcsx": [
    { step: "số liệu nửa giờ: lưu (dấu phẩy) 2 tổ máy", method: "POST", path: "shift-readings", json: { date: "2026-09-18", entries: [
      { unit: "S1", timeSlot: "00:30", metric: "P", value: "455,5" }, { unit: "S1", timeSlot: "01:00", metric: "Q", value: "12" }, { unit: "S2", timeSlot: "23:59", metric: "E", value: "221.4" }] },
      after: ["shift-readings?date=2026-09-18"] },
    { step: "số liệu nửa giờ: xoá ô (rỗng)", method: "POST", path: "shift-readings", json: { date: "2026-09-18", entries: [{ unit: "S1", timeSlot: "01:00", metric: "Q", value: "" }] },
      after: ["shift-readings?date=2026-09-18"] },
    { step: "số liệu nửa giờ: tổ máy sai", method: "POST", path: "shift-readings", json: { date: "2026-09-18", entries: [{ unit: "S3", timeSlot: "00:30", metric: "P", value: "1" }] } },
    { step: "số liệu nửa giờ: giá trị chữ", method: "POST", path: "shift-readings", json: { date: "2026-09-18", entries: [{ unit: "S1", timeSlot: "00:30", metric: "P", value: "abc" }] } },
    { step: "số liệu nửa giờ: đọc ngày sai", method: "GET", path: "shift-readings?date=18-09-2026" },
    { step: "sự kiện: thay danh sách S1", method: "POST", path: "operating-events", json: { date: "2026-09-17", unit: "S1", events: [
      { startAt: "2026-09-17 08:00", endAt: "2026-09-17 09:30", eventType: 1, description: "Giảm tải theo lệnh A0" }, { startAt: "2026-09-17 20:00", eventType: 4, description: "" }] },
      after: ["operating-events?date=2026-09-17"] },
    { step: "sự kiện: xoá hết S2 (danh sách rỗng)", method: "POST", path: "operating-events", json: { date: "2026-09-17", unit: "S2", events: [] }, after: ["operating-events?date=2026-09-17"] },
    { step: "sự kiện: thời gian sai", method: "POST", path: "operating-events", json: { date: "2026-09-17", unit: "S1", events: [{ startAt: "2026-09-17T08:00", eventType: 1 }] } },
    { step: "sự kiện: loại sai", method: "POST", path: "operating-events", json: { date: "2026-09-17", unit: "S1", events: [{ startAt: "2026-09-17 08:00", eventType: 9 }] } },
    { step: "than tồn 24h: lưu", method: "POST", path: "bcsx-coal-stock", json: { operatingDate: "2026-09-17", value: "312450,75" }, after: ["daily-inputs?period=2026-09&date=2026-09-17&scope=non-ktkt"] },
    { step: "than tồn 24h: số âm", method: "POST", path: "bcsx-coal-stock", json: { operatingDate: "2026-09-17", value: "-5" } },
    { step: "than tồn 24h: ngày tương lai", method: "POST", path: "bcsx-coal-stock", json: { operatingDate: "2099-01-01", value: "5" } },
    { step: "nạp 2 file S1/S2 (xuất từ chính web)", method: "POST", path: "bcsx-section1-import", files: [["files", "bcsx-export?date=2026-09-17&unit=S1", "BCSX S1 17.09.2026.xlsx"], ["files", "bcsx-export?date=2026-09-17&unit=S2", "BCSX S2 17.09.2026.xlsx"]] },
    { step: "nạp chỉ 1 file", method: "POST", path: "bcsx-section1-import", files: [["files", "bcsx-export?date=2026-09-17&unit=S1", "BCSX_S1_17-09.xlsx"]] },
    { step: "nạp file không phải .xlsx", method: "POST", path: "bcsx-section1-import", files: [["files", "bcsx-export?date=2026-09-17&unit=S1", "a.xls"], ["files", "bcsx-export?date=2026-09-17&unit=S2", "b.csv"]] },
    { step: "nạp không phải multipart (415)", method: "POST", path: "bcsx-section1-import", json: {} },
    { step: "lệnh điều độ: thiếu file", method: "POST", path: "bcsx-operation-import", form: { date: "2026-09-17" } },
    { step: "lệnh điều độ: ngày sai", method: "POST", path: "bcsx-operation-import", form: { date: "17/09/2026" }, files: [["file", "bcsx-export?date=2026-09-17&unit=S1", "DanhSachLenhKetThuc.xlsx"]] },
    { step: "lệnh điều độ: file sai cấu trúc", method: "POST", path: "bcsx-operation-import", form: { date: "2026-09-17" }, files: [["file", "bcsx-export?date=2026-09-17&unit=S1", "DanhSachLenhKetThuc.xlsx"]] },
  ],
};
// Giá trị thay đổi giữa các lần chạy: id cấp mới (< 900000) và mốc thời gian ghi.
function normalize(value, key = "") {
  if (Array.isArray(value)) return value.map(v => normalize(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, k)]));
  if (/^(updated_?at|created_?at|deleted_?at|changed_?at)$/i.test(key) && value) return "<thời điểm>";
  if (key === "id" && typeof value === "number" && value < SEED_ID) return "<id mới>";
  return value;
}
async function call(cookie, method, p, init = {}) {
  const res = await fetch(new URL(`/api/ctktkt/${p}`, base), { method, headers: { cookie, ...(init.headers ?? {}) }, body: init.body });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { nonJson: text.slice(0, 200) }; }
  return { status: res.status, body: normalize(body) };
}
async function cleanupWrites() {
  const url = new URL(process.env.DATABASE_URL); url.search = "";
  const c = new pg.Client({ connectionString: url.toString() }); await c.connect();
  // Chỉ chạy sau seed() — seed đã chặn khi bảng có dòng id < 900000 có sẵn, nên mọi dòng id < 900000 lúc này là do kịch bản tạo ra.
  for (const t of SEEDED_TABLES) await c.query(`DELETE FROM public.ctktkt_${t} WHERE id < $1`, [SEED_ID]);
  await c.end();
}
async function runWrites(cookie) {
  const out = {};
  for (const [group, steps] of Object.entries(WRITE_SCENARIOS)) {
    await seed();
    // File tải lên = file Excel tháng 09/2026 do chính web xuất từ dữ liệu mẫu (vòng xuất → nhập).
    const exported = await fetch(new URL("/api/ctktkt/water-report/export?month=2026-09", base), { headers: { cookie } });
    const xlsx = Buffer.from(await exported.arrayBuffer());
    for (const [i, s] of steps.entries()) {
      const init = {};
      if (s.json !== undefined) { init.body = JSON.stringify(s.json); init.headers = { "Content-Type": "application/json" }; }
      if (s.raw !== undefined) { init.body = s.raw; init.headers = s.headers; }
      if (s.upload || s.form || s.files) {
        const fd = new FormData();
        if (s.upload) fd.set("file", new Blob([xlsx], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "theo-doi-nuoc-2026-09.xlsx");
        for (const [k, v] of Object.entries(s.upload ?? s.form ?? {})) fd.set(k, v);
        // Tệp lấy từ API xuất của chính web tại thời điểm chạy (dữ liệu mẫu cố định → tệp cố định).
        for (const [field, from, name] of s.files ?? []) {
          const res = await fetch(new URL(`/api/ctktkt/${from}`, base), { headers: { cookie } });
          fd.append(field, new Blob([Buffer.from(await res.arrayBuffer())], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
        }
        init.body = fd;
      }
      const result = { request: `${s.method} ${s.path}`, response: await call(cookie, s.method, s.path, init) };
      for (const a of s.after ?? []) result[`sau: GET ${a}`] = await call(cookie, "GET", a);
      out[`${group} #${String(i + 1).padStart(2, "0")} ${s.step}`] = result;
    }
    await cleanupWrites();
  }
  await seed();
  return out;
}

if (args.includes("--writes")) {
  const cookie = await sessionCookie();
  const actual = await runWrites(cookie);
  if (args.includes("--record")) {
    writeFileSync(WRITE_SNAPSHOT, JSON.stringify(actual, null, 1) + "\n");
    console.log(`Đã ghi hợp đồng GHI ${WRITE_SNAPSHOT}: ${Object.keys(actual).length} bước.`);
    for (const [k, v] of Object.entries(actual)) console.log(`  ${v.response.status}  ${k}`);
    process.exit(0);
  }
  if (!existsSync(WRITE_SNAPSHOT)) fail(`chưa có ${WRITE_SNAPSHOT} — chạy --writes --record trên code CŨ trước.`);
  const expected = JSON.parse(readFileSync(WRITE_SNAPSHOT, "utf8"));
  let failed = 0;
  for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const d = diff(expected[k], actual[k]);
    if (d.length) { failed++; console.log(`✗  ${k}`); for (const line of d) console.log(`     ${line}`); } else console.log(`✓  ${k}`);
  }
  const total = Object.keys(expected).length;
  console.log(failed ? `KẾT QUẢ GHI: ${failed}/${total} bước LỆCH hợp đồng` : `KẾT QUẢ GHI: ${total}/${total} bước khớp hợp đồng`);
  process.exit(failed ? 1 : 0);
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
