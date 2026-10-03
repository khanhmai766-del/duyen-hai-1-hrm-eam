// Chỉ đọc trang và tải ảnh trên localhost; không sửa lịch hoặc cơ sở dữ liệu.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { assertLocalBase } from "./_safety.mjs";

const base = "http://localhost:3030";
assertLocalBase(base);
const out = "reports/verify/scl-s2-diagram";
mkdirSync(out, { recursive: true });
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: "msedge" }); }
try {
  const context = await browser.newContext({ storageState: "reports/verify/mcp-state.json", acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole("button", { name: "Xem sơ đồ", exact: true }).waitFor();
  assert.equal(await page.locator("svg[aria-label^='Sơ đồ đường găng']").count(), 0);
  await page.getByRole("button", { name: "Xem sơ đồ", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator("svg[aria-label^='Sơ đồ đường găng']").count(), 0);
  await page.getByRole("button", { name: "Xem sơ đồ", exact: true }).click();
  const svg = page.locator("svg[aria-label^='Sơ đồ đường găng']").first();
  await svg.waitFor();
  assert.equal(await svg.locator("[data-milestone-id]").count(), 34);
  const imageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải ảnh PNG", exact: true }).click();
  const download = await imageDownload;
  assert.equal(await download.failure(), null);
  await download.saveAs(`${out}/duong-gang-SCL-S2-DH1-2026.png`);
  await page.keyboard.press("Escape");
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Xem sơ đồ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Phóng lớn sơ đồ", exact: true }).click();
    assert.match(await dialog.innerText(), /125%/);
    await dialog.getByRole("button", { name: "Thu nhỏ sơ đồ", exact: true }).click();
    await page.waitForTimeout(150);
    const scroll = dialog.locator("[data-critical-path-scroll]");
    assert.equal(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth), true);
    await page.screenshot({ path: `${out}/diagram-${width}.png` });
    await dialog.getByRole("button", { name: "Xem tổng thể", exact: true }).click();
    assert.match(await dialog.innerText(), /50%/);
    await dialog.locator("svg [role=button]").first().click();
    await page.getByRole("dialog").getByRole("heading", { name: "Mốc tiến độ SCL S2 — 2026", exact: true }).waitFor();
    await page.keyboard.press("Escape");
  }
  console.log("PASS: 34 nội dung, tải PNG, phóng/thu, cuộn và mở đúng chi tiết trên 360/390/1280px.");
  await context.close();
} finally { await browser.close(); }
