// So đầu ra của các hàm KTKT chạy cho máy (Google Mirror, API tích hợp) giữa hai phiên bản code — giai đoạn 3/4.
//
//   npx tsx scripts/verify/ctktkt-shadow-dump.mjs <tệp-ra.json>
//
// Gọi thẳng hàm (không qua HTTP) trên DB dev đã đổ dữ liệu mẫu (`npm run test:ctktkt:contract -- --seed`).
// Chạy một lần trên code cũ, một lần trên code mới rồi so hai tệp JSON (phải giống hệt).
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { assertDevDatabase, fail, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
assertDevDatabase();
const out = process.argv[2];
if (!out) fail("thiếu tệp ra");

const { buildMirrorSnapshot } = await import("../../modules/ctktkt/lib/google-mirror-snapshot.ts");
const { readOperatingData } = await import("../../modules/ctktkt/lib/operating-data-api.ts");
let legacyDb;
try { legacyDb = (await import("../../modules/ctktkt/db/index.ts")).getRawDb; } catch { /* đã gỡ lớp cũ */ }

const key = "shadow-dump-key-".repeat(4), expectedHash = createHash("sha256").update(key).digest("hex");
const result = {};
// Một ngày PPA hợp lệ (đủ 48 điểm) cho tháng 10 để so cả các sheet công tơ PPA; xoá ngay sau khi chụp.
const pg = (await import("pg")).default;
const url = new URL(process.env.DATABASE_URL); url.search = "";
const client = new pg.Client({ connectionString: url.toString() }); await client.connect();
const meter = base => Array.from({ length: 48 }, (_, i) => base + (i % 7) * 31.25);
await client.query("DELETE FROM public.ctktkt_ppa_heat_rate_daily WHERE id = 999999");
await client.query(`INSERT INTO public.ctktkt_ppa_heat_rate_daily(id,operating_date,source_data,source_files,gross_s1_kwh,net_s1_kwh,gross_s2_kwh,net_s2_kwh,ppa_plant,ppa_s1,ppa_s2,note_s1,note_s2,updated_at)
  VALUES (999999,'2026-10-05',$1,'["mau.xlsx"]','14600000','13550000','14200000','13100000','10200.5','10190.1','10210.7','Ghi chú S1','', '2026-10-06 00:00:00')`,
  [JSON.stringify({ grossS1: meter(300000), netS1: meter(282000), grossS2: meter(295000), netS2: meter(277500) })]);
try {
// Lỗi cũng phải giống nhau (vd nguồn PPA không đủ 48 điểm → dừng, không xuất).
for (const period of ["2026-08", "2026-09", "2026-10", "2026-11"]) result[`mirror ${period}`] = await buildMirrorSnapshot(period).catch(error => ({ error: String(error?.message ?? error) }));
for (const period of ["2026-09", "2026-10"]) for (const dataset of ["pmis", "ppa"]) {
  const request = new Request(`http://localhost/api/ctktkt/integration/v1/operating-data?period=${period}&dataset=${dataset}`, { headers: { authorization: `Bearer ${key}` } });
  // Bản cũ đọc qua getDb; bản Prisma bỏ qua getDb và dùng bộ đọc mặc định.
  const response = await readOperatingData(request, { getDb: legacyDb, expectedHash, today: "2026-09-18" });
  result[`operating-data ${period} ${dataset}`] = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
}
} finally { await client.query("DELETE FROM public.ctktkt_ppa_heat_rate_daily WHERE id = 999999"); await client.end(); }
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`Đã ghi ${out}:`, Object.keys(result).length, "mục");
process.exit(0);
