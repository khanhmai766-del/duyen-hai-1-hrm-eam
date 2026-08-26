#!/usr/bin/env node
/**
 * Soát giao diện MOBILE bằng trình duyệt thật, trên MA TRẬN dòng máy.
 * Mục tiêu: một thay đổi giao diện không được làm vỡ bố cục hay che mất nội dung
 * trên bất kỳ khổ màn hình nào đang dùng thực tế trong nhà máy.
 *
 *   node scripts/mobile-audit.mjs                                   # soát localhost:3000
 *   node scripts/mobile-audit.mjs --url https://duyenhai1.vn
 *   node scripts/mobile-audit.mjs --pages defects,materials         # chỉ vài trang
 *   node scripts/mobile-audit.mjs --devices se,s8                   # chỉ vài dòng máy
 *   node scripts/mobile-audit.mjs --save truoc.json                 # lưu mốc so sánh
 *   node scripts/mobile-audit.mjs --compare truoc.json              # so với mốc đã lưu
 *   node scripts/mobile-audit.mjs --no-shots                        # bỏ chụp ảnh cho nhanh
 *
 * Tài khoản lấy từ biến môi trường (KHÔNG ghi mật khẩu vào file này):
 *   AUDIT_EMAIL=admin@powerplant.vn AUDIT_PASSWORD=... node scripts/mobile-audit.mjs
 *
 * Yêu cầu: npm i (đã có playwright-core) + tải Chromium một lần:
 *   npx playwright install chromium
 *
 * ─── Bốn phép kiểm ───────────────────────────────────────────────────────────
 *  1. TRÀN NGANG   — trang cuộn ngang được (scrollWidth > clientWidth). Chỉ ra đúng
 *                    phần tử thò ra; bỏ qua phần tử nằm trong khung cuộn ngang hợp lệ
 *                    (bảng có overflow-x), vì đó là thiết kế cố ý.
 *  2. BỊ CHE       — nút/ô nhập nằm dưới thanh điều hướng đáy hoặc trong vùng an toàn
 *                    (thanh home iPhone). Chromium KHÔNG mô phỏng được safe-area của
 *                    iOS, nên script tự cộng thêm phần đệm khai báo ở BANG_MAY.
 *                    Soát hai lượt: ở đầu trang (chỉ thanh cố định/sticky) và sau khi
 *                    đã cuộn hết xuống đáy (mọi thứ còn bị che = thật sự không chạm tới).
 *  3. CHẠM NHỎ     — vùng chạm nhỏ hơn 44×44 (ngưỡng Apple HIG / WCAG 2.5.5).
 *  4. iOS TỰ PHÓNG — ô nhập có font-size < 16px khiến Safari tự phóng to khi focus,
 *                    làm lệch bố cục và người dùng phải tự thu lại.
 *
 * Kèm phép kiểm một lần: thẻ meta viewport có `viewport-fit=cover` chưa — thiếu nó
 * thì mọi `env(safe-area-inset-*)` trong CSS đều trả về 0 trên iOS.
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const arg = (ten, mac_dinh = null) => {
  const i = argv.indexOf(`--${ten}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : mac_dinh;
};
const co = (ten) => argv.includes(`--${ten}`);

const BASE = arg("url", "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.AUDIT_EMAIL || "admin@powerplant.vn";
const PASSWORD = process.env.AUDIT_PASSWORD;
const CHO = Number(arg("settle", "2500")); // chờ sau khi tải xong, để lazy-load lộ diện
const CHUP = !co("no-shots");
const THU_MUC_ANH = arg("shots-dir", ".mobile-audit");

/**
 * Ma trận dòng máy. `safeBottom` / `safeTop` là phần đệm hệ điều hành thật sự chiếm
 * chỗ — Chromium không mô phỏng được nên khai báo tay ở đây và script tự cộng vào
 * vùng bị che. Số đo lấy theo thông số Apple/Android chính thức.
 */
const BANG_MAY = [
  { id: "s8",  ten: "Galaxy S8/S22 (hẹp nhất)", width: 360, height: 740, dsf: 3, safeTop: 0,  safeBottom: 0  },
  { id: "se",  ten: "iPhone SE (2/3)",          width: 375, height: 667, dsf: 2, safeTop: 0,  safeBottom: 0  },
  { id: "i14", ten: "iPhone 14/15/16",          width: 393, height: 852, dsf: 3, safeTop: 59, safeBottom: 34 },
  { id: "px7", ten: "Pixel 7",                  width: 412, height: 915, dsf: 2.6, safeTop: 24, safeBottom: 24 },
  { id: "max", ten: "iPhone 15/16 Pro Max",     width: 430, height: 932, dsf: 3, safeTop: 59, safeBottom: 34 },
  { id: "mini", ten: "iPad mini (dọc)",         width: 768, height: 1024, dsf: 2, safeTop: 24, safeBottom: 20 },
];

const TRANG_MAC_DINH = [
  ["Trang chủ", "/"],
  ["Lịch làm việc", "/hr"],
  ["Khiếm khuyết", "/defects"],
  ["Danh mục vật tư", "/materials"],
  ["Quy trình thay thế", "/replacement-procedures"],
  ["Lịch thay thế", "/replacements"],
  ["Thiết bị", "/devices"],
  ["Lịch sử sửa chữa", "/repair-history"],
  ["PCCC", "/pccc"],
  ["Tài khoản", "/account"],
];

// Git Bash trên Windows tự biến "/defects" thành "C:/Program Files/Git/defects"
// (MSYS path conversion) — chấp nhận cả dạng không có dấu / đầu.
function tachDanhSachTrang(raw) {
  return raw.split(",").map((u) => {
    const t = u.trim();
    if (/^[A-Za-z]:[\\/]/.test(t)) {
      console.error(`Đối số --pages đã bị shell đổi thành đường dẫn Windows: ${t}`);
      console.error("Dùng dạng không có dấu / ở đầu:  --pages defects,materials");
      console.error("hoặc đặt MSYS_NO_PATHCONV=1 khi chạy bằng Git Bash.");
      process.exit(1);
    }
    const duongDan = t.startsWith("/") ? t : `/${t}`;
    return [duongDan, duongDan];
  });
}

const trang = arg("pages") ? tachDanhSachTrang(arg("pages")) : TRANG_MAC_DINH;

const locMay = arg("devices");
const may = locMay
  ? BANG_MAY.filter((m) => locMay.split(",").map((s) => s.trim().toLowerCase()).includes(m.id))
  : BANG_MAY;

if (!may.length) {
  console.error(`Không có dòng máy nào khớp --devices. Mã hợp lệ: ${BANG_MAY.map((m) => m.id).join(", ")}`);
  process.exit(1);
}
if (!PASSWORD) {
  console.error("Thiếu AUDIT_PASSWORD. Ví dụ:\n  AUDIT_PASSWORD='...' node scripts/mobile-audit.mjs");
  process.exit(1);
}

// ─── Phép kiểm chạy TRONG trang ───────────────────────────────────────────────
// Hàm này được serialize sang trình duyệt nên phải khép kín, không dùng biến ngoài.
function soatTrongTrang({ safeTop, safeBottom, daODayTrang }) {
  const NGUONG_CHAM = 44; // px CSS — Apple HIG & WCAG 2.5.5 (Target Size)
  const CHON_TUONG_TAC =
    'a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';

  const rong = document.documentElement.clientWidth;
  const cao = document.documentElement.clientHeight;

  /** Mô tả ngắn gọn một phần tử để người đọc lần ra được trong mã nguồn. */
  const ta = (el) => {
    const cls = (typeof el.className === "string" ? el.className : "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(".");
    const chu = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    return {
      the: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : ""),
      chu,
    };
  };

  const nhinThay = (el, r) => {
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };

  /** Phần tử có nằm trong một khung cuộn ngang cố ý không (bảng rộng, dải chip…)? */
  const trongKhungCuonNgang = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };

  const tatCa = Array.from(document.querySelectorAll("body *"));

  // ── 1. Tràn ngang ──────────────────────────────────────────────────────────
  const tranNgang = [];
  if (document.documentElement.scrollWidth > rong + 1) {
    for (const el of tatCa) {
      const r = el.getBoundingClientRect();
      if (!nhinThay(el, r)) continue;
      // Bỏ qua phần tử bị dịch ra ngoài có chủ đích (drawer đóng, sheet ẩn).
      if (getComputedStyle(el).position === "fixed" && r.left >= rong) continue;
      if (r.right <= rong + 1) continue;
      if (trongKhungCuonNgang(el)) continue;
      tranNgang.push({ ...ta(el), thoRa: Math.round(r.right - rong) });
    }
    // Chỉ giữ phần tử "gốc" — bỏ con nếu cha cũng tràn với mức tương đương.
    tranNgang.sort((a, b) => b.thoRa - a.thoRa);
  }

  // ── 2. Bị che ở đáy ────────────────────────────────────────────────────────
  // Đáy màn hình bị chiếm bởi: thanh nav cố định (nếu có) + vùng an toàn của HĐH.
  const thanhNav = document.querySelector("nav.fixed.bottom-0, nav[class*='fixed'][class*='bottom-0']");
  const caoNav = thanhNav ? Math.round(thanhNav.getBoundingClientRect().height) : 0;
  const dayBiChe = Math.max(caoNav, 0) + safeBottom;
  const nguongDay = cao - dayBiChe;

  const biChe = [];
  if (dayBiChe > 0) {
    for (const el of document.querySelectorAll(CHON_TUONG_TAC)) {
      const r = el.getBoundingClientRect();
      if (!nhinThay(el, r)) continue;
      if (thanhNav && thanhNav.contains(el)) continue;          // chính thanh nav
      if (el.closest("[data-mobile-audit-ignore]")) continue;   // cho phép miễn trừ tại chỗ
      if (r.top >= cao || r.bottom <= 0) continue;              // ngoài khung nhìn hiện tại
      // Ở ĐẦU trang chỉ báo phần tử NEO CỐ ĐỊNH — nội dung cuộn được thì cuộn tiếp là thấy.
      // Khi ĐÃ CUỘN HẾT xuống đáy thì mọi phần tử còn nằm dưới vạch đều thật sự
      // không chạm tới được (đệm đáy của <main> không đủ), nên xét tất cả.
      if (!daODayTrang) {
        const neoCoDinh = (() => {
          for (let p = el; p && p !== document.body; p = p.parentElement) {
            const pos = getComputedStyle(p).position;
            if (pos === "fixed" || pos === "sticky") return true;
          }
          return false;
        })();
        if (!neoCoDinh) continue;
      }
      if (r.bottom <= nguongDay) continue;
      biChe.push({ ...ta(el), chongLan: Math.round(r.bottom - nguongDay) });
    }
  }

  // ── 3. Vùng chạm quá nhỏ ───────────────────────────────────────────────────
  const chamNho = [];
  for (const el of document.querySelectorAll(CHON_TUONG_TAC)) {
    const r = el.getBoundingClientRect();
    if (!nhinThay(el, r)) continue;
    if (r.top > cao || r.bottom < 0) continue; // chỉ xét phần đang hiển thị
    if (el.closest("table")) continue;         // ô trong bảng dày — xét riêng, không spam
    if (r.width >= NGUONG_CHAM && r.height >= NGUONG_CHAM) continue;
    chamNho.push({
      ...ta(el),
      kichThuoc: `${Math.round(r.width)}×${Math.round(r.height)}`,
      canh: Math.round(Math.min(r.width, r.height)),
    });
  }
  // Nhỏ nhất lên trước: ô nhập cao 40px (h-10) chỉ thiếu 4px so với chuẩn, còn
  // nút 24px mới là chỗ thật sự khó chạm — phải nổi lên đầu báo cáo.
  chamNho.sort((a, b) => a.canh - b.canh);

  // ── 4. Ô nhập khiến iOS tự phóng to ────────────────────────────────────────
  const tuPhongTo = [];
  for (const el of document.querySelectorAll("input, select, textarea")) {
    const r = el.getBoundingClientRect();
    if (!nhinThay(el, r)) continue;
    if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio") continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px >= 16) continue;
    tuPhongTo.push({ ...ta(el), fontSize: `${px}px` });
  }

  return {
    rong,
    cao,
    caoNav,
    scrollWidth: document.documentElement.scrollWidth,
    tranNgang: tranNgang.slice(0, 12),
    soTranNgang: tranNgang.length,
    biChe: biChe.slice(0, 12),
    soBiChe: biChe.length,
    chamNho: chamNho.slice(0, 12),
    soChamNho: chamNho.length,
    tuPhongTo: tuPhongTo.slice(0, 8),
    soTuPhongTo: tuPhongTo.length,
  };
}

// ─── Chạy ─────────────────────────────────────────────────────────────────────
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.error("Không mở được Chromium. Tải một lần bằng:  npx playwright install chromium");
  console.error(String(e).split("\n")[0]);
  process.exit(1);
}

const ketQua = [];
let kiemViewport = null;

for (const m of may) {
  const ctx = await browser.newContext({
    viewport: { width: m.width, height: m.height },
    deviceScaleFactor: m.dsf,
    isMobile: true,
    hasTouch: true,
    locale: "vi-VN",
  });
  const page = await ctx.newPage();
  const loiJs = [];
  page.on("pageerror", (e) => loiJs.push(String(e).slice(0, 200)));

  // --- Đăng nhập -------------------------------------------------------------
  // Trang login có HAI nút chữ "Đăng nhập" (một cho vân tay), nên phải nhắm
  // button[type="submit"] chứ không dùng getByRole theo tên.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500); // chờ hydrate, nếu điền quá sớm React sẽ ghi đè ô nhập

  if (kiemViewport === null) {
    kiemViewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      const content = meta?.getAttribute("content") ?? "";
      return { content, coCover: /viewport-fit\s*=\s*cover/.test(content) };
    });
  }

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
  await page.waitForTimeout(2000);

  for (const [ten, duongDan] of trang) {
    process.stdout.write(`  ${m.id.padEnd(5)} ${duongDan} ... `);
    try {
      await page.goto(BASE + duongDan, { waitUntil: "networkidle", timeout: 150000 });
    } catch {
      console.log("BỎ QUA (tải quá lâu)");
      ketQua.push({ may: m.id, mayTen: m.ten, ten, duong_dan: duongDan, loi: "tải quá lâu" });
      continue;
    }
    await page.waitForTimeout(CHO);

    const bao = await page.evaluate(soatTrongTrang, {
      safeTop: m.safeTop,
      safeBottom: m.safeBottom,
      daODayTrang: false,
    });

    // Lượt hai: cuộn hết xuống đáy rồi soát lại phần bị che. Bắt đúng trường hợp
    // hàng/nút cuối trang chui dưới thanh nav vì đệm đáy không đủ.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const oDay = await page.evaluate(soatTrongTrang, {
      safeTop: m.safeTop,
      safeBottom: m.safeBottom,
      daODayTrang: true,
    });
    bao.biCheCuoiTrang = oDay.biChe;
    bao.soBiCheCuoiTrang = oDay.soBiChe;
    await page.evaluate(() => window.scrollTo(0, 0));

    if (CHUP) {
      const tep = join(THU_MUC_ANH, m.id, `${duongDan.replace(/^\//, "").replace(/\//g, "-") || "trang-chu"}.png`);
      mkdirSync(dirname(tep), { recursive: true });
      await page.screenshot({ path: tep, fullPage: true });
      bao.anh = tep;
    }

    const soLoi = bao.soTranNgang + bao.soBiChe + bao.soBiCheCuoiTrang;
    console.log(
      soLoi > 0
        ? `${soLoi} LỖI (tràn ${bao.soTranNgang}, che ${bao.soBiChe + bao.soBiCheCuoiTrang})`
        : bao.soChamNho + bao.soTuPhongTo > 0
          ? `ok (cảnh báo: chạm nhỏ ${bao.soChamNho}, tự phóng ${bao.soTuPhongTo})`
          : "ok"
    );

    ketQua.push({ may: m.id, mayTen: m.ten, ten, duong_dan: duongDan, ...bao, loiJs: [...loiJs] });
    loiJs.length = 0;
  }

  await ctx.close();
}

await browser.close();

// ─── In báo cáo ───────────────────────────────────────────────────────────────
const gach = "=".repeat(80);
console.log(`\n${gach}\nSOÁT GIAO DIỆN MOBILE · ${BASE} · ${new Date().toLocaleString("vi-VN")}\n${gach}`);

console.log(`\n▸ Thẻ meta viewport: ${kiemViewport?.content || "(không có)"}`);
console.log(
  kiemViewport?.coCover
    ? "  ✔ Có viewport-fit=cover — env(safe-area-inset-*) hoạt động trên iPhone có thanh home."
    : "  ✘ THIẾU viewport-fit=cover — mọi env(safe-area-inset-*) sẽ bằng 0 trên iOS.\n" +
      "    Sửa: thêm `export const viewport` (viewportFit: \"cover\") vào app/layout.tsx."
);

// Bảng tổng hợp: hàng = trang, cột = dòng máy
const tenTrang = [...new Set(ketQua.map((r) => r.ten))];
console.log(`\n▸ Tổng hợp (số lỗi TRÀN NGANG + BỊ CHE)\n`);
const rongCot = Math.max(...tenTrang.map((t) => t.length), 16);
console.log("  " + "TRANG".padEnd(rongCot) + may.map((m) => m.id.padStart(7)).join(""));
for (const t of tenTrang) {
  const o = may.map((m) => {
    const r = ketQua.find((x) => x.ten === t && x.may === m.id);
    if (!r) return "-".padStart(7);
    if (r.loi) return "?".padStart(7);
    const n = r.soTranNgang + r.soBiChe + r.soBiCheCuoiTrang;
    return (n === 0 ? "·" : String(n)).padStart(7);
  });
  console.log("  " + t.padEnd(rongCot) + o.join(""));
}
console.log(`\n  · = sạch   số = số lỗi   ? = không tải được`);

// Chi tiết từng chỗ hỏng
const hong = ketQua.filter((r) => !r.loi && r.soTranNgang + r.soBiChe + r.soBiCheCuoiTrang > 0);
if (hong.length) {
  console.log(`\n${gach}\nCHI TIẾT\n${gach}`);
  for (const r of hong) {
    console.log(`\n### ${r.ten} — ${r.mayTen} (${r.rong}px)`);
    if (r.soTranNgang) {
      console.log(`  TRÀN NGANG: nội dung rộng ${r.scrollWidth}px / khung ${r.rong}px · ${r.soTranNgang} phần tử`);
      for (const e of r.tranNgang.slice(0, 5)) {
        console.log(`    ▸ thò ${String(e.thoRa).padStart(4)}px  ${e.the}${e.chu ? `  «${e.chu}»` : ""}`);
      }
    }
    if (r.soBiChe) {
      console.log(`  BỊ CHE (thanh cố định/sticky dưới thanh nav ${r.caoNav}px + vùng an toàn) · ${r.soBiChe} phần tử`);
      for (const e of r.biChe.slice(0, 5)) {
        console.log(`    ▸ chồng ${String(e.chongLan).padStart(4)}px  ${e.the}${e.chu ? `  «${e.chu}»` : ""}`);
      }
    }
    if (r.soBiCheCuoiTrang) {
      console.log(`  KHÔNG CHẠM TỚI: đã cuộn hết đáy mà vẫn bị che · ${r.soBiCheCuoiTrang} phần tử`);
      console.log(`    (đệm đáy của <main> không đủ — tăng pb-[calc(...+env(safe-area-inset-bottom))])`);
      for (const e of r.biCheCuoiTrang.slice(0, 5)) {
        console.log(`    ▸ chồng ${String(e.chongLan).padStart(4)}px  ${e.the}${e.chu ? `  «${e.chu}»` : ""}`);
      }
    }
  }
}

// Cảnh báo gộp (không tính là lỗi chặn, nhưng nên xử lý)
const tongChamNho = ketQua.reduce((s, r) => s + (r.soChamNho || 0), 0);
const tongPhongTo = ketQua.reduce((s, r) => s + (r.soTuPhongTo || 0), 0);
if (tongChamNho || tongPhongTo) {
  console.log(`\n${gach}\nCẢNH BÁO\n${gach}`);
  if (tongPhongTo) {
    const viDu = new Map();
    for (const r of ketQua) for (const e of r.tuPhongTo ?? []) if (!viDu.has(e.the)) viDu.set(e.the, e);
    console.log(`\n  Ô nhập font < 16px (iOS tự phóng to khi chạm vào): ${viDu.size} kiểu`);
    for (const e of [...viDu.values()].slice(0, 8)) console.log(`    ▸ ${e.fontSize.padStart(6)}  ${e.the}`);
  }
  if (tongChamNho) {
    const viDu = new Map();
    for (const r of ketQua) for (const e of r.chamNho ?? []) if (!viDu.has(e.the)) viDu.set(e.the, e);
    console.log(`\n  Vùng chạm < 44×44: ${viDu.size} kiểu`);
    for (const e of [...viDu.values()].sort((a, b) => a.canh - b.canh).slice(0, 8)) {
      console.log(`    ▸ ${e.kichThuoc.padStart(9)}  ${e.the}${e.chu ? `  «${e.chu}»` : ""}`);
    }
  }
}

if (CHUP) console.log(`\n▸ Ảnh chụp: ${THU_MUC_ANH}/<dòng máy>/<trang>.png`);

// So với mốc đã lưu
if (co("compare")) {
  const moc = JSON.parse(readFileSync(arg("compare"), "utf8"));
  const key = (r) => `${r.may}|${r.duong_dan}`;
  const cu = new Map((moc.ketQua ?? []).map((r) => [key(r), r]));
  console.log(`\n${gach}\nSO VỚI MỐC ${arg("compare")}\n${gach}`);
  let doi = 0;
  for (const r of ketQua) {
    const c = cu.get(key(r));
    if (!c) continue;
    const moi = (r.soTranNgang ?? 0) + (r.soBiChe ?? 0) + (r.soBiCheCuoiTrang ?? 0);
    const truoc = (c.soTranNgang ?? 0) + (c.soBiChe ?? 0) + (c.soBiCheCuoiTrang ?? 0);
    if (moi === truoc) continue;
    doi++;
    console.log(`  ${moi > truoc ? "▲ XẤU ĐI" : "▼ tốt lên"}  ${r.ten} · ${r.mayTen}: ${truoc} → ${moi}`);
  }
  if (!doi) console.log("  Không đổi.");
}

if (co("save")) {
  writeFileSync(arg("save"), JSON.stringify({ base: BASE, luc: new Date().toISOString(), ketQua }, null, 2));
  console.log(`\n▸ Đã lưu mốc: ${arg("save")}`);
}

const tongLoi = ketQua.reduce((s, r) => s + (r.soTranNgang ?? 0) + (r.soBiChe ?? 0) + (r.soBiCheCuoiTrang ?? 0), 0);
console.log(`\n▸ Tổng: ${tongLoi} lỗi bố cục trên ${trang.length} trang × ${may.length} dòng máy.\n`);
process.exit(tongLoi > 0 && co("strict") ? 1 : 0);
