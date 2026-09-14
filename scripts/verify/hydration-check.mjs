// Bắt lỗi hydration (React #418/#423/#425) trên một trang, theo nhiều tình huống giờ của trình duyệt.
//   ROUTE=/ ROUNDS=2 node scripts/verify/hydration-check.mjs <BASE> [out.json]
// Chạy với `next dev` để React in CHI TIẾT đoạn lệch; với bản build (next start) chỉ có mã lỗi.
// Git Bash trên Windows: thêm MSYS_NO_PATHCONV=1 để ROUTE="/..." không bị đổi thành đường dẫn ổ đĩa.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";
import { assertDevDatabase, assertLocalBase, defaultOut, loadDevEnv } from "./_safety.mjs";

loadDevEnv();
const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
const BASE = (BASE_ARG ?? "http://127.0.0.1:3030").replace(/\/$/, "");
assertLocalBase(BASE);
assertDevDatabase();
const OUT = OUT_ARG ?? defaultOut("hydration");
const ROUTE = process.env.ROUTE ?? "/";
const ROUNDS = Number(process.env.ROUNDS ?? 1);
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();

// VPS chạy UTC còn người dùng giờ VN: lệch múi giờ/đồng hồ là nguồn lệch hydrate hay gặp nhất.
const SCENARIOS = [
  { name: "bình thường", ctx: {}, clockOffsetMs: 0 },
  { name: "trình duyệt múi giờ UTC", ctx: { timezoneId: "UTC" }, clockOffsetMs: 0 },
  { name: "đồng hồ trình duyệt +90 giây", ctx: {}, clockOffsetMs: 90_000 },
  { name: "đồng hồ trình duyệt +9 giờ", ctx: {}, clockOffsetMs: 9 * 3600_000 },
];

const tag = Date.now();
const user = await prisma.user.create({
  data: {
    name: "TEST hydrate (tạm)", employeeId: `TMP-HYD-${tag}`, email: `tmp-hydrate-${tag}@local.test`,
    passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), role: "ADMIN",
  },
});

const results = [];
let browser;
let total = 0;
try {
  const token = { sub: user.id, id: user.id, name: user.name, email: user.email, role: "ADMIN", accessMode: "NORMAL", employeeId: user.employeeId };
  const value = await encode({ token, secret, salt: "authjs.session-token", maxAge: 3600 });
  browser = await chromium.launch();
  for (let round = 1; round <= ROUNDS; round++) {
    for (const sc of SCENARIOS) {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, ...sc.ctx });
      await ctx.addCookies([{ name: "authjs.session-token", value, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
      const page = await ctx.newPage();
      if (sc.clockOffsetMs) {
        try {
          await page.clock.install({ time: new Date(Date.now() + sc.clockOffsetMs) });
          await page.clock.resume();
        } catch (e) {
          console.log(`  (không cài được đồng hồ giả: ${e.message.split("\n")[0]})`);
        }
      }
      const errors = [];
      const isHydration = (t) => /hydrat|did not match|didn't match|#418|#423|#425|server rendered/i.test(t);
      page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && isHydration(m.text())) errors.push(m.text().slice(0, 4000)); });
      page.on("pageerror", (e) => { if (isHydration(e.message)) errors.push("PAGEERROR " + e.message.slice(0, 4000)); });
      try {
        await page.goto(BASE + ROUTE, { waitUntil: "networkidle", timeout: 120000 });
      } catch (e) {
        errors.push("GOTO " + e.message.split("\n")[0]);
      }
      await page.waitForTimeout(2500);
      const r = { round, scenario: sc.name, hydrationErrors: [...new Set(errors)] };
      total += r.hydrationErrors.length;
      results.push(r);
      console.log(`=== vòng ${round} · ${sc.name}: ${r.hydrationErrors.length} lỗi hydration`);
      for (const e of r.hydrationErrors) console.log(e.slice(0, 2500) + "\n---");
      await ctx.close();
    }
  }
} finally {
  await browser?.close();
  await prisma.user.delete({ where: { id: user.id } }).catch(async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } }).catch(() => {});
  });
  await prisma.$disconnect();
  writeFileSync(OUT, JSON.stringify({ base: BASE, route: ROUTE, results }, null, 2));
  console.log(`user tạm: đã dọn · đã ghi ${OUT}\nKẾT QUẢ: ${total === 0 ? "0 lỗi hydration" : `${total} lỗi hydration`}`);
}
process.exit(total === 0 ? 0 : 1);
