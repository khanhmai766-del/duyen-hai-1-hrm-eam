// Đi qua MỌI trang bằng tài khoản ADMIN tạm (DB dev local), ghi lỗi — làm mốc so trước/sau khi nâng cấp.
//   node scripts/verify/crawl.mjs <BASE> [out.json]
//   vd: node scripts/verify/crawl.mjs http://127.0.0.1:3031
// Tạo user tạm → ký cookie phiên bằng AUTH_SECRET DEV (không in ra) → duyệt → xoá user.
// Ghi mỗi trang: API trả ≥400, lỗi JS (pageError), console.error, toast, mã HTTP, tiêu đề h1.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { assertDevDatabase, assertLocalBase, defaultOut, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
const BASE = (BASE_ARG ?? "http://127.0.0.1:3031").replace(/\/$/, "");
assertLocalBase(BASE);
assertDevDatabase();
const OUT = OUT_ARG ?? defaultOut("crawl");
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();

// Danh sách trang tĩnh (cập nhật khi thêm trang mới). Trang động lấy id thật từ DB bên dưới.
const STATIC = `/ /account /admin/broadcast /admin/roles /admin/users /chemical-inventory /defects /devices /devices/scan
/documents/archive /documents/archive/bgts-tuabin-ngung /documents/contracts /documents/contracts/acceptance
/documents/contracts/contractors /documents/contracts/departments /documents/contracts/documents
/documents/contracts/inspections /documents/contracts/issues /documents/contracts/list /documents/contracts/list/new
/documents/contracts/milestones /documents/contracts/personnel /documents/contracts/supervision-decisions
/documents/pid /documents/procedures /forum /grounding-lightning /hr /hr/admin-attendance /hr/admin-registration
/hr/check-in /hr/org-chart /hr/shift-roster /loading-preview /material-annual-plans /material-annual-plans/monthly
/materials /notifications /pccc /public/org-chart /public/qlvt-sync-privacy /repair-history /replacement-history
/replacement-procedures /replacements /reports /tbycnn /tien-ich/phan-tich-dau /tien-ich/so-sanh-shn-ppa
/vat-tu/loai-dau /work-permits`.split(/\s+/).filter(Boolean);

async function firstOrNull(fn) {
  try { return await fn(); } catch { return null; }
}

const tag = Date.now();
const user = await prisma.user.create({
  data: {
    name: "TEST crawl (tạm)", employeeId: `TMP-CRAWL-${tag}`, email: `tmp-crawl-${tag}@local.test`,
    passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), role: "ADMIN",
  },
});

const results = {};
let browser;
try {
  const device = await firstOrNull(() => prisma.device.findFirst({ select: { id: true } }));
  const seqRow = await firstOrNull(() => prisma.$queryRawUnsafe(`SELECT seq FROM "EquipmentNode" WHERE seq IS NOT NULL LIMIT 1`));
  const dynamic = {
    "/devices/[id]": device && `/devices/${device.id}`,
    "/devices/[id]/qr": device && `/devices/${device.id}/qr`,
    "/repair-history/[deviceId]": device && `/repair-history/${device.id}`,
    "/public/devices/[id]": device && `/public/devices/${device.id}`,
    "/public/equipment/[seq]": seqRow?.[0]?.seq != null && `/public/equipment/${seqRow[0].seq}`,
  };
  const routes = [...STATIC, "/login"];
  for (const [pattern, url] of Object.entries(dynamic)) {
    if (url) routes.push(url);
    else results[pattern] = { skipped: "không có dữ liệu mẫu trong DB local" };
  }

  const token = { sub: user.id, id: user.id, name: user.name, email: user.email, role: "ADMIN", accessMode: "NORMAL", employeeId: user.employeeId };
  const value = await encode({ token, secret, salt: "authjs.session-token", maxAge: 3600 });
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.addCookies([{ name: "authjs.session-token", value, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);

  for (const route of routes) {
    const page = await ctx.newPage();
    const r = { api: [], console: [], pageErrors: [], toasts: [] };
    page.on("response", (res) => {
      const u = new URL(res.url());
      if (u.pathname.startsWith("/api/") && res.status() >= 400) r.api.push(`${res.request().method()} ${u.pathname} → ${res.status()}`);
      if (u.pathname.startsWith("/_next/") && res.status() >= 400) r.api.push(`ASSET ${u.pathname} → ${res.status()}`);
    });
    page.on("console", (m) => { if (m.type() === "error") r.console.push(m.text().replace(/\s+/g, " ").slice(0, 200)); });
    page.on("pageerror", (e) => r.pageErrors.push(e.message.replace(/\s+/g, " ").slice(0, 200)));
    const t0 = Date.now();
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
      r.status = resp?.status() ?? null;
    } catch (e) {
      r.gotoError = e.message.split("\n")[0].slice(0, 160);
    }
    await page.waitForTimeout(1500);
    r.ms = Date.now() - t0;
    r.finalPath = new URL(page.url()).pathname;
    r.h1 = (await page.locator("h1").first().innerText({ timeout: 1000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 60);
    r.toasts = (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").slice(0, 120));
    r.nextError = await page.locator("text=/Application error|Unhandled Runtime Error|This page could not be found/").count().catch(() => 0);
    r.api = [...new Set(r.api)]; r.console = [...new Set(r.console)]; r.pageErrors = [...new Set(r.pageErrors)];
    results[route] = r;
    const bad = r.pageErrors.length + r.api.length + (r.nextError ? 1 : 0) + (r.gotoError ? 1 : 0);
    console.log(`${bad ? "!!" : "ok"} ${route} → ${r.status ?? "-"} ${r.finalPath} ${r.ms}ms api≥400:${r.api.length} pageErr:${r.pageErrors.length} console:${r.console.length}${r.nextError ? " NEXT-ERROR" : ""}`);
    await page.close();
  }
} finally {
  await browser?.close();
  const del = await prisma.user.delete({ where: { id: user.id } }).then(() => "đã xoá", async (e) => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } }).catch(() => {});
    return "không xoá được → đã khoá (" + e.message.split("\n").pop().slice(0, 80) + ")";
  });
  console.log("user tạm:", del);
  await prisma.$disconnect();
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log("đã ghi", OUT);
}
