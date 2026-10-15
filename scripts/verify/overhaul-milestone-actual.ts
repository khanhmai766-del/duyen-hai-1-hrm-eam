/** Kiểm tra API cập nhật THỰC TẾ mốc SCL bằng tài khoản và mốc tạm, chỉ trên localhost; dọn dữ liệu thử ở finally.
 * npx tsx scripts/verify/overhaul-milestone-actual.ts   (dev server phải chạy ở cổng 3030) */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { request, type APIRequestContext } from "playwright-core";
import { assertDevDatabase, assertLocalBase, loadDevEnv } from "./_safety.mjs";
import { OVERHAUL_CAMPAIGN, vietnamDate, type MilestoneSchedule } from "../../lib/overhaul-milestones";

loadDevEnv();
const base = assertLocalBase("http://localhost:3030")!;
assertDevDatabase();
const prisma = new PrismaClient();
const tag = randomUUID();
const userIds: string[] = [];
const clients: APIRequestContext[] = [];

async function client(role: "ADMIN" | "MANAGER" | "SUPERVISOR" | "TECHNICIAN" | "VIEWER", adminMode = true) {
  const user = await prisma.user.create({ data: {
    name: `TEST thực tế SCL (${role}, tạm)`, email: `scl-actual-${role}-${adminMode}-${tag}@local.test`, employeeId: `SCLA-${role}-${adminMode ? 1 : 0}-${tag}`.slice(0, 60), role, passwordHash: "khong-dang-nhap-bang-mat-khau", isActive: true,
  } });
  userIds.push(user.id);
  const token = await encode({ token: { sub: user.id, id: user.id, role, name: user.name, email: user.email }, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token", maxAge: 1800 });
  const context = await request.newContext({ baseURL: base.origin, extraHTTPHeaders: { Cookie: `authjs.session-token=${token}${adminMode ? "; pp-admin-mode=1" : ""}` } });
  clients.push(context);
  return context;
}

async function main() {
  const today = vietnamDate();
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 5 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 5 * 86_400_000).toISOString().slice(0, 10);
  const range = await prisma.overhaulMilestone.create({ data: { campaign: OVERHAUL_CAMPAIGN, sourceKey: `test-actual:${tag}:range`, title: `TEST khoảng tạm ${tag}`, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`) } });
  const point = await prisma.overhaulMilestone.create({ data: { campaign: OVERHAUL_CAMPAIGN, sourceKey: `test-actual:${tag}:point`, title: `TEST mốc đơn tạm ${tag}`, startDate: new Date(`${start}T00:00:00Z`) } });

  const technician = await client("TECHNICIAN"), manager = await client("MANAGER"), adminOff = await client("ADMIN", false);
  for (const [role, reader] of [["SUPERVISOR", await client("SUPERVISOR")], ["VIEWER", await client("VIEWER")]] as const) {
    assert.equal((await reader.put("/api/overhaul-milestones/actual", { data: { id: range.id, percent: 10 } })).status(), 403, role);
    assert.equal(((await (await reader.get("/api/overhaul-milestones")).json()).data as MilestoneSchedule).canUpdateActual, false, role);
  }
  console.log("PASS: Trưởng ca / Người xem đọc được nhưng không ghi thực tế (403).");

  const put = (ctx: APIRequestContext, data: Record<string, unknown>) => ctx.put("/api/overhaul-milestones/actual", { data });
  let res = await put(technician, { id: range.id, actualStart: start, percent: 40, note: "Kiểm thử" });
  assert.equal(res.status(), 200, await res.text());
  assert.equal((await put(manager, { id: range.id, actualStart: start, percent: 55 })).status(), 200);
  assert.equal((await put(adminOff, { id: range.id, actualStart: start, percent: 60 })).status(), 200, "ADMIN chưa bật chế độ quản trị = Quản lý, vẫn ghi được");
  const state = (await (await technician.get("/api/overhaul-milestones")).json()).data as MilestoneSchedule;
  assert.equal(state.canUpdateActual, true);
  const item = state.items.find((row) => row.id === range.id)!;
  assert.equal(item.actualPercent, 60);
  assert.equal(item.actualStart, start);
  assert.ok(item.actualUpdatedByName?.includes("ADMIN"));
  assert.equal(state.logs!.filter((log) => log.milestoneId === range.id).length, 3);
  console.log("PASS: Kỹ thuật viên, Quản lý, ADMIN ghi được; GET trả số thực tế, người cập nhật và nhật ký.");

  assert.equal((await put(technician, { id: range.id, actualStart: end, percent: 10 })).status(), 400, "ngày sau hôm nay");
  assert.equal((await put(technician, { id: range.id, percent: 100 })).status(), 400, "100% mà không có ngày hoàn thành");
  assert.equal((await put(technician, { id: point.id, percent: 50 })).status(), 400, "mốc đơn chỉ 0/100");
  assert.equal((await put(technician, { id: "khong-co", percent: 10 })).status(), 404);
  res = await put(technician, { id: point.id, actualEnd: today });
  assert.equal(res.status(), 200, await res.text());
  const done = await prisma.overhaulMilestone.findUniqueOrThrow({ where: { id: point.id } });
  assert.equal(done.actualPercent, 100);
  assert.equal(done.actualStart?.toISOString().slice(0, 10), today);
  console.log("PASS: chặn dữ liệu sai (400/404); hoàn thành mốc đơn ghi 100% và ngày bắt đầu = ngày hoàn thành.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const context of clients) await context.dispose();
  const fixtures = await prisma.overhaulMilestone.findMany({ where: { sourceKey: { startsWith: `test-actual:${tag}` } }, select: { id: true } });
  await prisma.overhaulMilestoneProgress.deleteMany({ where: { OR: [{ milestoneId: { in: fixtures.map((row) => row.id) } }, { createdById: { in: userIds } }] } });
  await prisma.overhaulMilestone.deleteMany({ where: { sourceKey: { startsWith: `test-actual:${tag}` } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.systemAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
