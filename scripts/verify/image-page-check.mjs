// Kiểm tra ảnh bằng trình duyệt thật: có ảnh vỡ không, ảnh tĩnh có tải qua /_next/image (WebP) không,
// tổng dung lượng ảnh tải về. /login mở KHÔNG đăng nhập; trang khác dùng phiên ADMIN tạm (DB dev local).
//   node scripts/verify/image-page-check.mjs <BASE> [trang ...]
//   vd: node scripts/verify/image-page-check.mjs http://127.0.0.1:3031 /login / /hr /account
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { assertDevDatabase, assertLocalBase, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
const [BASE_ARG, ...routeArgs] = process.argv.slice(2);
const BASE = (BASE_ARG ?? "http://127.0.0.1:3031").replace(/\/$/, "");
assertLocalBase(BASE);
assertDevDatabase();
const ROUTES = routeArgs.length ? routeArgs : ["/login", "/", "/hr", "/account"];
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();
const tag = Date.now();
const user = await prisma.user.create({
  data: {
    name: "TEST ảnh (tạm)", employeeId: `TMP-IMG-${tag}`, email: `tmp-img-${tag}@local.test`,
    passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), role: "ADMIN",
  },
});

let browser;
let bad = 0;
try {
  const token = { sub: user.id, id: user.id, name: user.name, email: user.email, role: "ADMIN", accessMode: "NORMAL", employeeId: user.employeeId };
  const value = await encode({ token, secret, salt: "authjs.session-token", maxAge: 3600 });
  browser = await chromium.launch();
  for (const route of ROUTES) {
    const auth = route !== "/login";
    for (const width of [1366, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 860 } });
      if (auth) await ctx.addCookies([{ name: "authjs.session-token", value, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
      const page = await ctx.newPage();
      const optimized = [];
      const rawStatic = [];
      page.on("response", async (res) => {
        const u = new URL(res.url());
        if (u.pathname === "/_next/image") {
          const len = Number(res.headers()["content-length"] ?? 0) || (await res.body().catch(() => Buffer.alloc(0))).length;
          optimized.push({ src: u.searchParams.get("url"), w: u.searchParams.get("w"), status: res.status(), type: res.headers()["content-type"], kb: Math.round(len / 1024) });
        } else if (/^\/(brand|chucvu|icons3d)\//.test(u.pathname)) {
          rawStatic.push({ src: u.pathname, status: res.status(), kb: Math.round(Number(res.headers()["content-length"] ?? 0) / 1024) });
        }
      });
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120000 }).catch((e) => console.log("GOTO", e.message.split("\n")[0]));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2500);
      const broken = await page.evaluate(() =>
        [...document.images]
          .filter((i) => i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== "none")
          .map((i) => i.currentSrc || i.src)
      );
      const failed = optimized.filter((o) => o.status !== 200 || !String(o.type).includes("webp"));
      if (broken.length || failed.length) bad++;
      console.log(`${broken.length || failed.length ? "SAI" : "OK "} ${route} @${width}px: qua /_next/image ${optimized.length} ảnh (${optimized.reduce((n, o) => n + o.kb, 0)} KB, lỗi ${failed.length}) | ảnh tĩnh tải thẳng ${rawStatic.length} (${rawStatic.reduce((n, o) => n + o.kb, 0)} KB) | ảnh vỡ ${broken.length}`);
      for (const o of optimized) console.log(`     ${o.status} ${String(o.type).split(";")[0]} w=${o.w} ${o.kb}KB ${o.src}`);
      for (const r of rawStatic) console.log(`     (tải thẳng) ${r.status} ${r.kb}KB ${r.src}`);
      for (const b of broken) console.log(`     VỠ: ${b}`);
      await ctx.close();
    }
  }
} finally {
  await browser?.close();
  await prisma.user.delete({ where: { id: user.id } }).catch(async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } }).catch(() => {});
  });
  await prisma.$disconnect();
  console.log(`user tạm: đã dọn\nKẾT QUẢ: ${bad === 0 ? "ĐẠT" : `${bad} lượt SAI`}`);
}
process.exit(bad ? 1 : 0);
