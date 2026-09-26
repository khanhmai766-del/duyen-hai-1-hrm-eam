// Chụp giao diện ở nhiều khổ màn hình (điện thoại → máy tính) và tự soi lỗi bố cục hay gặp.
//
//   node scripts/verify/ui-shots.mjs [BASE] [/tuyen ...] [--widths=360,390,1280] [--preset=pct-lam-viec]
//                                    [--parts=3] [--keep-mascot] [--out=reports/verify/ui-...]
//   npm run verify:ui -- /work-permits /defects
//   npm run verify:ui -- --preset=pct-lam-viec
//
// Mỗi tuyến × mỗi khổ: ảnh cả trang (`-full.png`) + vài ảnh theo khung nhìn khi cuộn (`-p0.png`…). Ảnh cả trang
// đặt SAI các phần tử `fixed`/`sticky` (thanh điều hướng đáy, nút dính đáy) — đánh giá chúng trên ảnh `-pN`.
// Báo cáo `report.json` + tóm tắt trên màn hình:
//   LỖI  trang cuộn ngang, lỗi JS, API trả ≥ 500
//   CẢNH BÁO  phần tử lòi khỏi mép phải (ngoài vùng cuộn ngang có chủ đích), nút/ô bấm < 32px trên điện thoại,
//             chữ bị cắt (overflow hidden, không có dấu …), API 4xx, console.error
// Mã thoát 1 khi có LỖI.
//
// An toàn: giống crawl.mjs — tạo ADMIN tạm trên DB dev local, ký cookie bằng AUTH_SECRET của .env, xoá user sau
// khi chạy; từ chối nếu BASE/DB không phải local (xem _safety.mjs). Kết quả ở reports/verify/ (gitignore).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { assertDevDatabase, assertLocalBase, fail, loadDevEnv } from "./_safety.mjs";
import { PRESETS } from "./ui-presets.mjs";

loadDevEnv();
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => args.includes(`--${name}`);
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:3030").replace(/\/$/, "");
assertLocalBase(BASE);
assertDevDatabase();

const WIDTHS = option("widths", "360,390,1280").split(",").map(Number).filter((w) => w >= 280 && w <= 3840);
const PARTS = Math.max(0, Number(option("parts", "3")));
const presetName = option("preset", "");
const preset = presetName ? PRESETS[presetName] : null;
if (presetName && !preset) fail(`không có preset "${presetName}". Có: ${Object.keys(PRESETS).join(", ")}`);
// Git Bash đổi "/x" thành "C:/Program Files/Git/x" — nhận lại phần sau "Git".
const routeArgs = args.filter((a) => !a.startsWith("--") && !/^https?:\/\//.test(a)).map((a) => a.replace(/^[A-Za-z]:\/Program Files\/Git/, ""));
if (!routeArgs.length && !preset) fail("chưa có tuyến nào — vd: npm run verify:ui -- /work-permits  hoặc  --preset=pct-lam-viec");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = option("out", path.join("reports", "verify", `ui-${stamp}`));
mkdirSync(OUT, { recursive: true });

const MOBILE_MAX = 767;
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();
const slug = (route) => (route.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "home").slice(0, 60);

async function launch() {
  try { return await chromium.launch(); }
  catch {
    // Máy chưa `npx playwright-core install chromium`: dùng Edge có sẵn trên Windows.
    try { return await chromium.launch({ channel: "msedge" }); }
    catch { fail("không mở được trình duyệt — chạy `npx playwright-core install chromium` một lần."); }
  }
}

/** Soi bố cục trong trang (chạy trong trình duyệt). */
function inspectLayout({ mobile }) {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const describe = (el) => {
    const text = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 4).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` “${text}”` : ""}`;
  };
  // Chữ chỉ cho trình đọc màn hình (sr-only: 1×1px, bị cắt) không phải thứ người dùng nhìn thấy.
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && !el.closest(".sr-only"); };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const all = [...document.body.querySelectorAll("*")].filter((el) => !el.closest("[data-ui-overlay]"));
  const offRight = all.filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1 && !inScroller(el))
    // Chỉ báo phần tử ngoài cùng, không báo cả chuỗi con cháu của nó.
    .filter((el, _i, list) => !list.includes(el.parentElement)).slice(0, 8).map((el) => `${describe(el)} → mép phải ${Math.round(el.getBoundingClientRect().right)}px / ${vw}px`);
  const smallTargets = mobile ? [...document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, textarea")]
    .filter((el) => visible(el) && !el.closest("[data-ui-overlay]") && !el.disabled)
    .filter((el) => { const r = el.getBoundingClientRect(); return (r.height < 32 || r.width < 32) && !(el.tagName === "INPUT" && ["checkbox", "radio", "range"].includes(el.type)); })
    .slice(0, 10).map((el) => { const r = el.getBoundingClientRect(); return `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}px`; }) : [];
  const clipped = all.filter((el) => {
    if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const s = getComputedStyle(el);
    return /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== "ellipsis" && s.webkitLineClamp === "none" && el.scrollWidth > el.clientWidth + 2;
  }).slice(0, 8).map(describe);
  return { scrollWidth: doc.scrollWidth, clientWidth: vw, horizontalScroll: doc.scrollWidth > vw + 1, offRight, smallTargets, clipped };
}

const tag = Date.now();
const user = await prisma.user.create({
  data: { name: "TEST giao diện (tạm)", employeeId: `TMP-UI-${tag}`, email: `tmp-ui-${tag}@local.test`,
    passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), role: "ADMIN" },
});
const report = { base: BASE, preset: presetName || null, widths: WIDTHS, shots: [] };
let errorCount = 0;
let warnCount = 0;
let browser;
try {
  const presetCtx = preset ? { ...(await preset.prepare({ prisma })), base: BASE } : null;
  const routes = [...(preset ? preset.routes(presetCtx) : []), ...routeArgs];
  const token = await encode({ token: { sub: user.id, id: user.id, name: user.name, email: user.email, role: "ADMIN", accessMode: "NORMAL", employeeId: user.employeeId }, secret, salt: "authjs.session-token", maxAge: 3600 });
  browser = await launch();
  for (const width of WIDTHS) {
    const mobile = width <= MOBILE_MAX;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
    await context.addCookies([{ name: "authjs.session-token", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
    if (preset?.mock) await preset.mock(context, presetCtx);
    for (const route of routes) {
      const page = await context.newPage();
      const shot = { route, width, errors: [], warnings: [], files: [] };
      page.on("pageerror", (e) => shot.errors.push(`Lỗi JS: ${e.message.split("\n")[0]}`));
      page.on("console", (m) => { if (m.type() === "error") shot.warnings.push(`console.error: ${m.text().split("\n")[0].slice(0, 200)}`); });
      page.on("response", (r) => {
        if (!r.url().includes("/api/") || r.status() < 400) return;
        (r.status() >= 500 ? shot.errors : shot.warnings).push(`API ${r.status()} ${new URL(r.url()).pathname}`);
      });
      try { await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 180_000 }); }
      catch (e) { shot.errors.push(`Không tải được: ${e.message.split("\n")[0]}`); }
      await page.waitForTimeout(1500);
      if (new URL(page.url()).pathname.startsWith("/login")) shot.errors.push("Bị chuyển về /login — phiên tạm không được chấp nhận");
      if (!flag("keep-mascot")) await page.addStyleTag({ content: "[data-ui-overlay]{display:none!important}" }).catch(() => {});
      const layout = await page.evaluate(inspectLayout, { mobile });
      if (layout.horizontalScroll) shot.errors.push(`Trang cuộn ngang: rộng ${layout.scrollWidth}px trên khung ${layout.clientWidth}px`);
      for (const w of layout.offRight) shot.warnings.push(`Lòi khỏi mép phải: ${w}`);
      for (const w of layout.smallTargets) shot.warnings.push(`Nút/ô bấm nhỏ hơn 32px: ${w}`);
      for (const w of layout.clipped) shot.warnings.push(`Chữ bị cắt: ${w}`);
      const name = `${slug(route)}-${width}`;
      const full = path.join(OUT, `${name}-full.png`);
      await page.screenshot({ path: full, fullPage: true });
      shot.files.push(full);
      const height = page.viewportSize().height;
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let i = 0; i < PARTS && i * height * 0.8 < total; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(i * height * 0.8));
        await page.waitForTimeout(300);
        const file = path.join(OUT, `${name}-p${i}.png`);
        await page.screenshot({ path: file });
        shot.files.push(file);
      }
      shot.errors = [...new Set(shot.errors)];
      shot.warnings = [...new Set(shot.warnings)];
      errorCount += shot.errors.length;
      warnCount += shot.warnings.length;
      report.shots.push(shot);
      console.log(`${shot.errors.length ? "✗" : shot.warnings.length ? "!" : "✓"} ${width}px ${route}`);
      for (const e of shot.errors) console.log(`    LỖI  ${e}`);
      for (const w of shot.warnings) console.log(`    cảnh báo  ${w}`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser?.close();
  await prisma.user.delete({ where: { id: user.id } }).catch(async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } }).catch(() => {});
  });
  await prisma.$disconnect();
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nuser tạm: đã dọn · ảnh + report.json ở ${OUT}\nKẾT QUẢ: ${errorCount} lỗi · ${warnCount} cảnh báo`);
}
process.exit(errorCount ? 1 : 0);
