import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { groundingRetentionWindow } from "../../lib/grounding-retention";
import { purgeGroundingHistory } from "../../lib/server/grounding-retention";

test("Giữ 1 tháng 15 ngày theo ngày vận hành, xử lý cuối tháng và năm nhuận", () => {
  for (const [now, date] of [
    ["2026-10-06T06:00:00+07:00", "2026-08-22"],
    ["2026-10-06T05:59:59+07:00", "2026-08-21"],
    ["2026-03-31T15:00:00+07:00", "2026-02-13"],
    ["2024-03-31T15:00:00+07:00", "2024-02-14"],
    ["2027-01-01T06:00:00+07:00", "2026-11-16"],
  ]) {
    const result = groundingRetentionWindow(new Date(now));
    assert.equal(result.date, date);
    assert.equal(result.cutoff.toISOString(), new Date(`${date}T06:00:00+07:00`).toISOString());
  }
});

test("Dọn chỉ lịch sử/nhật ký riêng quá hạn, vẫn chạy khi chưa có SystemAuditLog", async () => {
  for (const exists of [true, false]) {
    const calls: Array<{ table: string; args: unknown }> = [];
    const tx = {
      groundingLightningInspection: { deleteMany: async (args: unknown) => { calls.push({ table: "inspections", args }); return { count: 3 }; } },
      auditLog: { deleteMany: async (args: unknown) => { calls.push({ table: "audit", args }); return { count: 3 }; } },
      systemAuditLog: { deleteMany: async (args: unknown) => { calls.push({ table: "system", args }); return { count: 3 }; } },
      $queryRaw: async () => [{ exists }],
    };
    const db = { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
    const cutoff = new Date("2026-08-22T06:00:00+07:00");
    const counts = await purgeGroundingHistory(db, new Date("2026-10-06T15:00:00+07:00"));
    assert.deepEqual(calls[0], { table: "inspections", args: { where: { signedAt: { lt: cutoff } } } });
    const entities = ["GroundingLightningItem", "GroundingLightningAttachment", "GroundingLightningInspection"];
    assert.deepEqual(calls[1], { table: "audit", args: { where: { entity: { in: entities }, createdAt: { lt: cutoff } } } });
    if (exists) assert.deepEqual(calls[2], { table: "system", args: { where: { targetType: { in: entities }, createdAt: { lt: cutoff } } } });
    assert.equal(calls.length, exists ? 3 : 2);
    assert.equal(counts.systemAuditLogs, exists ? 3 : 0);
  }
});
