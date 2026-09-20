/** Kiểm tra tự đóng trên DB local; toàn bộ dữ liệu thử được hoàn tác bằng transaction. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { closeDueInternalPermits, INTERNAL_AUTO_CLOSE_ACTION, INTERNAL_AUTO_CLOSE_DELAY } from "../../lib/server/work-permit-auto-close";

loadEnvConfig(process.cwd());
const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "5433", "Chỉ kiểm tra trên PostgreSQL local:5433");
const db = new PrismaClient();
const prefix = `QA-PCT-AUTOCLOSE-${randomUUID()}`;
const rollback = new Error("Hoàn tác dữ liệu thử");
async function main() {
  const user = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true } });
  assert.ok(user, "Cần ADMIN có sẵn để tạo mẫu trong giao dịch thử");
  const now = new Date();
  const completedAt = new Date(now.getTime() - INTERNAL_AUTO_CLOSE_DELAY);
  try {
    await db.$transaction(async tx => {
      const defects = new Map<string, string>();
      for (const [name, status, completed, cancelled] of [
        ["due", "DA_XU_LY", completedAt, null],
        ["not-due", "DA_XU_LY", new Date(completedAt.getTime() + 1), null],
        ["reopened", "CO_PCT", completedAt, null],
        ["cancelled", "DA_XU_LY", completedAt, now],
        ["no-completion", "DA_XU_LY", null, null],
      ] as const) {
        const d = await tx.defect.create({ data: { id: `${prefix}-${name}`, unit: "S1", status, completedAt: completed, cancelledAt: cancelled, createdById: user.id } });
        defects.set(name, d.id);
      }
      const cases = [
        ["electronic", "due", "INTERNAL", "ELECTRONIC", "ISSUED", "CLOSED"],
        ["paper", "due", "INTERNAL", "PAPER", "ISSUED", "CLOSED"],
        ["legacy", "due", "INTERNAL", "PAPER", "ACTIVE", "CLOSED"],
        ["contractor", "due", "CONTRACTOR", "PAPER", "ISSUED", "ISSUED"],
        ["contractor-active", "due", "CONTRACTOR", "PAPER", "ACTIVE", "ACTIVE"],
        ["draft", "due", "INTERNAL", "ELECTRONIC", "DRAFT", "DRAFT"],
        ["cancelled-permit", "due", "INTERNAL", "ELECTRONIC", "CANCELLED", "CANCELLED"],
        ["closed-permit", "due", "INTERNAL", "PAPER", "CLOSED", "CLOSED"],
        ["not-due", "not-due", "INTERNAL", "ELECTRONIC", "ISSUED", "ISSUED"],
        ["reopened", "reopened", "INTERNAL", "PAPER", "ISSUED", "ISSUED"],
        ["cancelled-syc", "cancelled", "INTERNAL", "ELECTRONIC", "ISSUED", "ISSUED"],
        ["no-completion", "no-completion", "INTERNAL", "ELECTRONIC", "ISSUED", "ISSUED"],
        ["unlinked", "", "INTERNAL", "PAPER", "ISSUED", "ISSUED"],
      ] as const;
      for (const [name, source, teamType, format, status] of cases) {
        await tx.workPermit.create({ data: { id: `${prefix}-pct-${name}`, kind: "MECHANICAL", year: now.getUTCFullYear(), number: `${prefix}-${name}`, unit: "S1", content: "Mẫu thử được hoàn tác", workDate: now.toISOString().slice(0, 10), teamType, format, status, defectId: defects.get(source) ?? null, issuedAt: status === "DRAFT" ? null : completedAt, createdById: user.id, createdByName: user.name } });
      }
      await closeDueInternalPermits(tx, now);
      for (const [name, , , , , expected] of cases) {
        const p = await tx.workPermit.findUniqueOrThrow({ where: { id: `${prefix}-pct-${name}` } });
        assert.equal(p.status, expected, name);
        if (["electronic", "paper", "legacy"].includes(name)) {
          assert.equal(p.closedAt?.getTime(), now.getTime());
          assert.equal(p.version, 2);
          assert.match(p.result, /Chỉ đóng bản ghi trong sổ/);
        }
      }
      assert.equal(await tx.workPermitHistory.count({ where: { permitId: { startsWith: prefix }, action: INTERNAL_AUTO_CLOSE_ACTION } }), 3);
      await closeDueInternalPermits(tx, now);
      assert.equal(await tx.workPermitHistory.count({ where: { permitId: { startsWith: prefix } } }), 3, "Không ghi lặp lịch sử");
      await closeDueInternalPermits(tx, new Date(now.getTime() + 2));
      assert.equal((await tx.workPermit.findUniqueOrThrow({ where: { id: `${prefix}-pct-not-due` } })).status, "CLOSED", "Chỉ đóng khi đủ 24 giờ");
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.workPermit.count({ where: { id: { startsWith: prefix } } }), 0);
  assert.equal(await db.defect.count({ where: { id: { startsWith: prefix } } }), 0);
  console.info("Đạt 13 nhánh tự đóng: nội bộ điện tử/giấy, mốc 24 giờ, mở lại, nhà thầu, nháp/hủy/đóng, thiếu SYC/mốc hoàn thành; không lặp lịch sử. Đã hoàn tác toàn bộ giao dịch thử.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
