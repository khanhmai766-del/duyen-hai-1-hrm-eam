/** Kiểm tra tương tác lịch/chuông trên localhost. Mốc và thời gian giả lập qua route,
 * không sửa bộ mốc thật trong DB local. Tài khoản tạm được dọn sau khi chạy. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { chromium, type Browser } from "playwright-core";
import { assertDevDatabase, assertLocalBase, loadDevEnv } from "./_safety.mjs";
import { buildMilestoneSchedule, parseMilestoneInput, type OverhaulMilestone } from "../../lib/overhaul-milestones";
import { S2_MILESTONES_SOURCE } from "../../lib/overhaul-milestones-source";

loadDevEnv();
const base = assertLocalBase("http://localhost:3030")!;
assertDevDatabase();
const prisma = new PrismaClient();
let browser: Browser | undefined;
let userId: string | undefined;
async function main() {
  const tag = randomUUID();
  const user = await prisma.user.create({ data: { name: "TEST SCL giao diện (tạm)", email: `scl-browser-${tag}@local.test`, employeeId: `SCL-${tag}`, passwordHash: "khong-dang-nhap", role: "ADMIN" } });
  userId = user.id;
  const token = await encode({ token: { sub: user.id, id: user.id, name: user.name, email: user.email, role: "ADMIN", employeeId: user.employeeId }, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token", maxAge: 1800 });
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: "msedge" }); }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  await context.addCookies([
    { name: "authjs.session-token", value: token, domain: base.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "pp-admin-mode", value: "1", domain: base.hostname, path: "/" },
  ]);
  let day = "2026-11-21";
  let items: OverhaulMilestone[] = S2_MILESTONES_SOURCE.map((row) => ({ ...row, id: row.sourceKey, createdById: null, updatedById: null, createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z" }));
  await context.route("**/api/overhaul-milestones", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      const body = route.request().postDataJSON();
      if (method === "DELETE") items = items.filter((item) => item.id !== body.id);
      else {
        const input = parseMilestoneInput(body);
        if (method === "PUT") items = items.map((item) => item.id === body.id ? { ...item, ...input } : item);
        else items.push({ ...items[0], ...input, id: "ui-added", sourceKey: "ui-added", sortOrder: 100 });
      }
      await route.fulfill({ json: { data: { id: body.id ?? "ui-added" }, meta: null, error: null } });
    } else await route.fulfill({ json: { data: buildMilestoneSchedule(items, new Date(`${day}T08:00:00+07:00`)), meta: null, error: null } });
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-11-21T08:00:00+07:00") });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const card = page.getByRole("region", { name: "Mốc tiến độ SCL S2 — 2026" });
  // section có aria-label, trình duyệt ánh xạ thành region.
  for (const [date, count] of [["2026-10-06", 2], ["2026-11-21", 3], ["2026-12-01", 2], ["2026-12-03", 2], ["2026-12-04", 0]] as const) {
    day = date;
    await page.goto(base.origin, { waitUntil: "networkidle" });
    if (count) await card.getByText(`${count} mốc`, { exact: true }).waitFor();
    else await card.getByText("Hôm nay không có mốc đến ngày kế hoạch.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Thông báo", exact: true }).click();
    assert.equal(await page.getByRole("link").filter({ hasText: "Mốc SCL S2 hôm nay:" }).count(), count);
    await page.getByRole("button", { name: "Thông báo", exact: true }).click();
    console.log(`PASS giao diện ${date}: ${count} mốc trên trang chủ và chuông`);
  }
  day = "2026-11-21";
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await page.getByRole("link", { name: /Mốc SCL S2 hôm nay: Nghiệm thu hệ thống Diesel khẩn/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Sửa mốc Nghiệm thu hệ thống Diesel khẩn", exact: true }).click();
  await dialog.getByLabel("Ngày bắt đầu / ngày mốc").fill("2026-11-22");
  await dialog.getByRole("button", { name: "Lưu mốc", exact: true }).click();
  await dialog.getByPlaceholder("Tìm theo nội dung mốc…").waitFor();
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await card.getByText("2 mốc", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  assert.equal(await page.getByRole("link", { name: /Mốc SCL S2 hôm nay: Nghiệm thu hệ thống Diesel khẩn/ }).count(), 0);
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await page.getByRole("button", { name: "Xem toàn bộ lịch" }).click();
  await dialog.getByRole("button", { name: "Xoá mốc Nghiệm thu hệ thống Diesel khẩn", exact: true }).click();
  await dialog.getByRole("button", { name: "Xác nhận xoá", exact: true }).click();
  await dialog.getByText("33/33 nội dung · Giờ Việt Nam", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Thêm mốc", exact: true }).click();
  await dialog.getByLabel("Tên mốc").fill("Mốc thử tương tác local");
  await dialog.getByLabel("Ngày bắt đầu / ngày mốc").fill(day);
  await dialog.getByRole("button", { name: "Lưu mốc", exact: true }).click();
  await dialog.getByPlaceholder("Tìm theo nội dung mốc…").waitFor();
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await card.getByText("3 mốc", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await page.getByRole("link", { name: /Mốc SCL S2 hôm nay: Mốc thử tương tác local/ }).waitFor();
  mkdirSync("reports/verify/scl-s2-interaction", { recursive: true });
  await page.screenshot({ path: "reports/verify/scl-s2-interaction/bell-after-create.png" });
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  day = "2026-12-04";
  await page.clock.runFor(60_001);
  await card.getByText("Hôm nay không có mốc đến ngày kế hoạch.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  assert.equal(await page.getByRole("link").filter({ hasText: "Mốc SCL S2 hôm nay:" }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: bấm chuông mở đúng mốc; sửa ngày/xoá/thêm và tự cập nhật sau 1 phút đồng thời lịch/chuông; không lỗi JS.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
