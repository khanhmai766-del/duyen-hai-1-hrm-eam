// Thời gian/lịch chỉ giả lập trong trình duyệt, không ghi cơ sở dữ liệu.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { buildMilestoneSchedule } from "../../lib/overhaul-milestones.ts";
import { assertLocalBase } from "./_safety.mjs";
const base = "http://localhost:3030";
assertLocalBase(base);
const out = "reports/verify/scl-s2-animation-scenes";
mkdirSync(out, { recursive: true });
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: "msedge" }); }
try {
  const context = await browser.newContext({ storageState: "reports/verify/mcp-state.json", viewport: { width: 1280, height: 900 } });
  const response = await context.request.get(`${base}/api/overhaul-milestones`);
  assert.equal(response.status(), 200);
  const items = (await response.json()).data.items;
  let day = "2026-10-03";
  await context.route("**/api/overhaul-milestones", (route) => route.fulfill({ json: { data: buildMilestoneSchedule(items, new Date(`${day}T08:00:00+07:00`)), meta: null, error: null } }));
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-10-03T08:00:00+07:00") });
  const card = page.getByRole("region", { name: "Mốc tiến độ SCL S2 — 2026" });
  for (const [date, theme] of [["2026-10-03", "maintenance"], ["2026-10-06", "isolation"], ["2026-10-15", "turbine-stop"], ["2026-10-27", "lifting"], ["2026-11-21", "diesel"], ["2026-11-28", "firing"], ["2026-12-01", "electrical"]]) {
    day = date;
    await page.goto(base);
    await card.locator(`[data-animation-theme=${theme}]`).waitFor();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await card.screenshot({ path: `${out}/${date}-${theme}.png` });
  }
  day = "2026-11-21";
  await page.goto(base);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.clock.runFor(7100);
  assert.equal(await card.locator("[data-animation-theme]").getAttribute("data-animation-theme"), "pressure");
  await page.clock.runFor(7100);
  assert.equal(await card.locator("[data-animation-theme]").getAttribute("data-animation-theme"), "pressure"); // Nén nước lò.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const paused = card.locator("[data-animation-theme]");
  assert.equal(await paused.getAttribute("data-running"), "false");
  const theme = await paused.getAttribute("data-animation-theme");
  await page.clock.runFor(7100);
  assert.equal(await paused.getAttribute("data-animation-theme"), theme);
  assert.equal(await paused.locator("svg").evaluate((svg) => [...svg.querySelectorAll("*")].every((node) => getComputedStyle(node).animationName === "none")), true);
  await context.close();
  console.log("PASS: chủ đề đúng theo 7 ngày, luân phiên mốc cùng ngày, tắt chuyển động theo reduced-motion.");
} finally { await browser.close(); }
