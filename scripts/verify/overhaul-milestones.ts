/** Kiểm tra API thật bằng tài khoản và mốc tạm, chỉ trên localhost; dọn dữ liệu thử ở finally.
 * npx tsx scripts/verify/overhaul-milestones.ts */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { chromium, request, type APIRequestContext } from "playwright-core";
import { mkdirSync } from "node:fs";
import { assertDevDatabase, assertLocalBase, loadDevEnv } from "./_safety.mjs";
import { OVERHAUL_CAMPAIGN, buildMilestoneSchedule, type MilestoneSchedule } from "../../lib/overhaul-milestones";
import { S2_MILESTONES_SOURCE } from "../../lib/overhaul-milestones-source";

loadDevEnv();
const base = assertLocalBase("http://localhost:3030")!;
assertDevDatabase();
const prisma = new PrismaClient();
const tag = randomUUID();
const userIds: string[] = [];
const fixtureIds: string[] = [];
const clients: APIRequestContext[] = [];
const sessions: { role: string; token: string }[] = [];

async function main() {
  async function client(role: "ADMIN" | "MANAGER" | "SUPERVISOR" | "TECHNICIAN" | "VIEWER") {
    const user = await prisma.user.create({ data: {
      name: `TEST mốc SCL (${role}, tạm)`, email: `scl-${role}-${tag}@local.test`, employeeId: `SCL-${role}-${tag}`, role, passwordHash: "khong-dang-nhap-bang-mat-khau", isActive: true,
    } });
    userIds.push(user.id);
    const token = await encode({ token: { sub: user.id, id: user.id, role, name: user.name, email: user.email }, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token", maxAge: 1800 });
    sessions.push({ role, token });
    const context = await request.newContext({ baseURL: base.origin, extraHTTPHeaders: { Cookie: `authjs.session-token=${token}; pp-admin-mode=1` } });
    clients.push(context);
    return context;
  }
  const admin = await client("ADMIN");
  const payload = { title: `TEST mốc tạm ${tag}`, startDate: "2026-11-22", endDate: "2026-11-24", note: "Chỉ dùng kiểm tra local" };
  for (const role of ["MANAGER", "SUPERVISOR", "TECHNICIAN", "VIEWER"] as const) {
    const reader = await client(role);
    assert.equal((await reader.get("/api/overhaul-milestones")).status(), 200);
    for (const method of ["post", "put", "delete"] as const) {
      assert.equal((await reader[method]("/api/overhaul-milestones", { data: { ...payload, id: "khong-co" } })).status(), 403, `${role}: ${method}`);
    }
  }
  const anonymous = await request.newContext({ baseURL: base.origin }); clients.push(anonymous);
  const anonymousResponse = await anonymous.get("/api/overhaul-milestones", { maxRedirects: 0 });
  assert.ok([401, 307].includes(anonymousResponse.status()));
  console.log("PASS: MANAGER/SUPERVISOR/TECHNICIAN/VIEWER đọc được, POST/PUT/DELETE trả 403; chưa đăng nhập bị chặn.");

  let browser;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: "msedge" }); }
  try {
    const out = "reports/verify/scl-s2-admin-only";
    mkdirSync(out, { recursive: true });
    for (const session of sessions) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "authjs.session-token", value: session.token, domain: base.hostname, path: "/", httpOnly: true }, { name: "pp-admin-mode", value: "on", domain: base.hostname, path: "/" }]);
      const page = await context.newPage();
      await page.goto(base.origin);
      await page.getByRole("button", { name: "Xem toàn bộ lịch", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: "Tách lưới", exact: true }).waitFor();
      assert.equal(await dialog.getByRole("button", { name: "Thêm mốc", exact: true }).count(), session.role === "ADMIN" ? 1 : 0);
      assert.equal(await dialog.getByRole("button", { name: /^Sửa mốc / }).count(), session.role === "ADMIN" ? S2_MILESTONES_SOURCE.length : 0);
      assert.equal(await dialog.getByRole("button", { name: /^Xoá mốc / }).count(), session.role === "ADMIN" ? S2_MILESTONES_SOURCE.length : 0);
      if (["ADMIN", "MANAGER"].includes(session.role)) for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${out}/${session.role}-${width}.png` });
      }
      await context.close();
    }
    console.log("PASS: giao diện chỉ ADMIN có nút thêm/sửa/xoá; 4 vai trò còn lại vẫn xem được lịch.");
  } finally { await browser.close(); }

  const invalid = await admin.post("/api/overhaul-milestones", { data: { ...payload, endDate: "2026-11-01" } });
  assert.equal(invalid.status(), 400);
  assert.equal((await admin.post("/api/overhaul-milestones", { data: { ...payload, startDate: "2026-02-30" } })).status(), 400);
  const created = await admin.post("/api/overhaul-milestones", { data: payload });
  assert.equal(created.status(), 200, await created.text());
  const row = (await created.json()).data;
  fixtureIds.push(row.id);
  assert.ok(row.sourceKey.startsWith("manual:"));
  async function schedule() { return (await (await admin.get("/api/overhaul-milestones")).json()).data as MilestoneSchedule; }
  let state = await schedule();
  assert.ok(state.items.some((item) => item.id === row.id));
  assert.equal(buildMilestoneSchedule(state.items.filter((item) => item.id === row.id), new Date("2026-11-22T08:00:00+07:00")).todayEvents.length, 1);
  assert.equal((await admin.put("/api/overhaul-milestones", { data: { ...payload, id: row.id, startDate: "2026-11-23" } })).status(), 200);
  state = await schedule();
  const edited = state.items.find((item) => item.id === row.id)!;
  assert.equal(edited.startDate, "2026-11-23");
  assert.equal(edited.updatedById, userIds[0]);
  assert.equal(edited.sourceKey, row.sourceKey);
  assert.equal(buildMilestoneSchedule([edited], new Date("2026-11-22T08:00:00+07:00")).todayEvents.length, 0);
  assert.equal((await admin.delete("/api/overhaul-milestones", { data: { id: row.id } })).status(), 200);
  assert.ok(!(await schedule()).items.some((item) => item.id === row.id));
  assert.equal((await admin.put("/api/overhaul-milestones", { data: { ...payload, id: row.id } })).status(), 404);
  console.log("PASS: thêm/sửa/xoá qua API, kiểm tra ngày, người sửa và thông báo cập nhật theo dữ liệu mới.");

  // Thử chính cơ chế skipDuplicates của bộ nạp, trên mốc riêng đã sửa và đã xoá.
  const seeded = await prisma.overhaulMilestone.create({ data: {
    campaign: OVERHAUL_CAMPAIGN, sourceKey: `test:${tag}`, title: "Đã sửa trên web", startDate: new Date("2026-11-01"), deletedAt: new Date(),
  } });
  fixtureIds.push(seeded.id);
  const duplicate = await prisma.overhaulMilestone.createMany({ data: [{ campaign: OVERHAUL_CAMPAIGN, sourceKey: seeded.sourceKey, title: "Tên cũ từ file", startDate: new Date("2026-10-07") }], skipDuplicates: true });
  assert.equal(duplicate.count, 0);
  const preserved = await prisma.overhaulMilestone.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(preserved.title, "Đã sửa trên web");
  assert.ok(preserved.deletedAt);
  console.log("PASS: nạp lại không trùng, không ghi đè sửa, không làm sống lại mốc đã xoá.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const context of clients) await context.dispose();
  // Tìm cả fixture đã tạo trước một lỗi trả response; không chạm bộ PL2.
  await prisma.overhaulMilestone.deleteMany({ where: { OR: [{ id: { in: fixtureIds } }, { createdById: { in: userIds } }, { sourceKey: `test:${tag}` }] } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.systemAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
