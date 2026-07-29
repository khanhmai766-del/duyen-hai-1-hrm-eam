#!/usr/bin/env node
/**
 * Đo hiệu năng tải trang bằng trình duyệt thật: ghi lại MỌI lời gọi /api trên từng trang
 * kèm số lần gọi, dung lượng và thời gian. Dùng để so trước/sau mỗi lần tối ưu hoặc deploy.
 *
 *   node scripts/perf-audit.mjs                          # đo localhost:3000
 *   node scripts/perf-audit.mjs --url https://duyenhai1.vn
 *   node scripts/perf-audit.mjs --save truoc.json        # lưu mốc so sánh
 *   node scripts/perf-audit.mjs --compare truoc.json     # so với mốc đã lưu
 *   node scripts/perf-audit.mjs --pages defects,reports   # chỉ đo vài trang
 *   node scripts/perf-audit.mjs --poll                   # kiểm tra polling khi tab bị ẩn
 *
 * Tài khoản lấy từ biến môi trường (KHÔNG ghi mật khẩu vào file này):
 *   AUDIT_EMAIL=admin@powerplant.vn AUDIT_PASSWORD=... node scripts/perf-audit.mjs
 *
 * Yêu cầu: npm i (đã có playwright-core) + browser Chromium đã tải một lần bằng
 *   npx playwright install chromium
 * playwright-core KHÔNG tự tải browser khi npm install — đó là lý do chọn nó thay vì
 * gói "playwright", để máy chủ production không phải kéo về ~150 MB Chromium vô ích.
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (ten, mac_dinh = null) => {
  const i = argv.indexOf(`--${ten}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : mac_dinh;
};
const co = (ten) => argv.includes(`--${ten}`);

const BASE = (arg("url", "http://localhost:3000")).replace(/\/$/, "");
const EMAIL = process.env.AUDIT_EMAIL || "admin@powerplant.vn";
const PASSWORD = process.env.AUDIT_PASSWORD;
const CHO = Number(arg("settle", "4000")); // thời gian chờ sau khi tải xong, để polling/lazy-load lộ diện

const TRANG_MAC_DINH = [
  ["Trang chủ", "/"],
  ["Khiếm khuyết", "/defects"],
  ["Danh mục vật tư", "/materials"],
  ["Lịch thay thế", "/replacements"],
  ["Thông tin thiết bị", "/devices"],
  ["Lịch sử sửa chữa", "/repair-history"],
  ["Báo cáo", "/reports"],
];
// Git Bash trên Windows tự biến "/defects" thành "C:/Program Files/Git/defects" (MSYS path
// conversion). Vì vậy chấp nhận cả dạng không có dấu / đầu — "--pages defects,reports" —
// và bắt lỗi rõ ràng nếu đối số đã bị shell nuốt mất.
const trang = arg("pages")
  ? arg("pages").split(",").map((u) => {
      const t = u.trim();
      if (/^[A-Za-z]:[\\/]/.test(t)) {
        console.error(`Đối số --pages đã bị shell đổi thành đường dẫn Windows: ${t}`);
        console.error("Dùng dạng không có dấu / ở đầu:  --pages defects,reports");
        console.error("hoặc đặt MSYS_NO_PATHCONV=1 khi chạy bằng Git Bash.");
        process.exit(1);
      }
      const duongDan = t.startsWith("/") ? t : `/${t}`;
      return [duongDan, duongDan];
    })
  : TRANG_MAC_DINH;

if (!PASSWORD) {
  console.error("Thiếu AUDIT_PASSWORD. Ví dụ:\n  AUDIT_PASSWORD='...' node scripts/perf-audit.mjs");
  process.exit(1);
}

const kb = (n) => n.toFixed(0).padStart(6);
const delta = (sau, truoc) => {
  if (truoc == null) return "";
  const d = sau - truoc;
  if (Math.abs(d) < Math.max(2, truoc * 0.02)) return "   (≈)";
  return d < 0 ? `   ▼ ${Math.abs(d).toFixed(0)} KB` : `   ▲ ${d.toFixed(0)} KB`;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

const loiJs = [];
page.on("pageerror", (e) => loiJs.push(String(e)));

// --- Đăng nhập ---------------------------------------------------------------
// Trang login có HAI nút chữ "Đăng nhập" (một cho vân tay), nên phải nhắm
// button[type="submit"] chứ không dùng getByRole theo tên.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500); // chờ hydrate, nếu điền quá sớm React sẽ ghi đè ô nhập
await page.locator("#email").fill(EMAIL);
await page.locator("#password").fill(PASSWORD);
await page.locator('button[type="submit"]').click();
try {
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
} catch {
  console.error("Đăng nhập thất bại — kiểm tra AUDIT_EMAIL / AUDIT_PASSWORD.");
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(2500);

// --- Ghi nhận lời gọi API ----------------------------------------------------
let ghi = [];
const batDau = new Map();
page.on("request", (r) => {
  if (r.url().includes("/api/")) batDau.set(r, Date.now());
});
page.on("response", async (r) => {
  const req = r.request();
  if (!req.url().includes("/api/")) return;
  let n = 0;
  try {
    n = (await r.body()).length / 1024;
  } catch {
    /* phản hồi bị huỷ hoặc redirect — bỏ qua */
  }
  ghi.push({
    duong_dan: new URL(req.url()).pathname,
    ms: Date.now() - (batDau.get(req) ?? Date.now()),
    kb: n,
    status: r.status(),
  });
});

const ketQua = [];
for (const [ten, duongDan] of trang) {
  ghi = [];
  const t0 = Date.now();
  await page.goto(BASE + duongDan, { waitUntil: "networkidle", timeout: 150000 });
  await page.waitForTimeout(CHO);
  const san_sang = Date.now() - t0;

  const theoDuongDan = new Map();
  for (const c of ghi) {
    const e = theoDuongDan.get(c.duong_dan) ?? { lan: 0, kb: 0, ms: 0 };
    e.lan++;
    e.kb += c.kb;
    e.ms = Math.max(e.ms, c.ms);
    theoDuongDan.set(c.duong_dan, e);
  }
  ketQua.push({
    ten,
    duong_dan: duongDan,
    so_request: ghi.length,
    kb: ghi.reduce((s, c) => s + c.kb, 0),
    san_sang,
    chi_tiet: Object.fromEntries(theoDuongDan),
  });
}

// --- Kiểm tra polling khi tab bị ẩn -----------------------------------------
// Chromium headless luôn báo document.hidden = false, nên phải giả lập trạng thái ẩn
// rồi tự phát sự kiện visibilitychange để TanStack Query nhận biết.
let ketQuaPolling = null;
if (co("poll")) {
  const giay = Number(arg("poll-seconds", "120"));
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => {
    let an = false;
    Object.defineProperty(document, "hidden", { get: () => an, configurable: true });
    Object.defineProperty(document, "visibilityState", {
      get: () => (an ? "hidden" : "visible"),
      configurable: true,
    });
    window.__datTrangThaiAn = (v) => {
      an = v;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  await p2.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 150000 });
  await p2.waitForTimeout(6000);

  let dem = [];
  p2.on("request", (r) => {
    if (r.url().includes("/api/")) dem.push(new URL(r.url()).pathname);
  });

  console.log(`\nĐo polling: tab HIỆN trong ${giay}s ...`);
  await p2.waitForTimeout(giay * 1000);
  const khiHien = dem.length;

  await p2.evaluate(() => window.__datTrangThaiAn(true));
  dem = [];
  console.log(`Đo polling: tab ẨN trong ${giay}s ...`);
  await p2.waitForTimeout(giay * 1000);
  const khiAn = [...dem];

  ketQuaPolling = { giay, khiHien, khiAn: khiAn.length, chiTietAn: khiAn };
  await p2.close();
}

await browser.close();

// --- In kết quả --------------------------------------------------------------
const moc = co("compare") ? JSON.parse(readFileSync(arg("compare"), "utf8")) : null;
const mocTheoTen = new Map((moc?.trang ?? []).map((t) => [t.ten, t]));

console.log(`\n${"=".repeat(78)}\nĐO HIỆU NĂNG · ${BASE} · ${new Date().toLocaleString("vi-VN")}\n${"=".repeat(78)}`);

for (const t of ketQua) {
  const cu = mocTheoTen.get(t.ten);
  console.log(`\n### ${t.ten}  —  ${t.so_request} request · ${t.kb.toFixed(0)} KB · sẵn sàng ${t.san_sang}ms${delta(t.kb, cu?.kb)}`);
  const hang = Object.entries(t.chi_tiet).sort((a, b) => b[1].kb - a[1].kb);
  for (const [duongDan, e] of hang) {
    if (e.kb < 1 && e.lan === 1) continue; // ẩn các lời gọi nhỏ, một lần cho gọn
    const canh = e.lan > 1 ? `  ⚠️ gọi ${e.lan} lần` : "";
    console.log(`   ${kb(e.kb)} KB · ${String(e.ms).padStart(5)}ms · ${duongDan}${canh}`);
  }
}

console.log(`\n${"=".repeat(78)}\nTỔNG HỢP${moc ? `  (so với ${arg("compare")})` : ""}\n${"=".repeat(78)}`);
for (const t of ketQua) {
  const cu = mocTheoTen.get(t.ten);
  console.log(`  ${t.ten.padEnd(20)} ${String(t.so_request).padStart(3)} request · ${kb(t.kb)} KB · ${String(t.san_sang).padStart(6)}ms${delta(t.kb, cu?.kb)}`);
}

if (ketQuaPolling) {
  const { giay, khiHien, khiAn, chiTietAn } = ketQuaPolling;
  console.log(`\nPOLLING (${giay}s mỗi trạng thái)`);
  console.log(`  tab hiện : ${khiHien} request`);
  console.log(`  tab ẩn   : ${khiAn} request  ${khiAn === 0 ? "✅ đã dừng đúng" : "⚠️ VẪN GỌI khi ẩn"}`);
  if (khiAn > 0) {
    const m = new Map();
    for (const d of chiTietAn) m.set(d, (m.get(d) ?? 0) + 1);
    for (const [d, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(3)}× ${d}`);
    console.log("  → thêm refetchIntervalInBackground: false vào hook tương ứng");
  }
}

if (BASE.includes("localhost")) {
  console.log(
    "\nLƯU Ý: next dev bật reactStrictMode nên mỗi component mount hai lần —\n" +
      'các dòng "gọi 2 lần" thường là ảo, bản production chỉ gọi một lần.'
  );
}
console.log(loiJs.length ? `\n❌ Lỗi JS: ${loiJs.slice(0, 3).join(" | ")}` : "\n✅ Không có lỗi JS trên console");

if (co("save")) {
  writeFileSync(arg("save"), JSON.stringify({ base: BASE, luc: new Date().toISOString(), trang: ketQua }, null, 2));
  console.log(`\nĐã lưu mốc so sánh: ${arg("save")}`);
}
