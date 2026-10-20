import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../lib/prisma";
import { prepareDefectSourceRecords, upsertPreparedDefectRecords, type DefectSourceRecord } from "../../lib/defect-source-sync";

const record: DefectSourceRecord = {
  sourceSpreadsheetId: "test-sheet", sourceSheet: "ĐIỆN_DH1", sourceRow: 3286,
  requestType: "Điện", stt: "2178", unit: "S2", deviceRaw: "Tủ nguồn", positionRaw: "Lò phó S2",
  content: "Xử lý tủ máy cắt", detectedAtRaw: "16/10/2026", shiftLeaderRaw: "", reminderRaw: "",
  repeatedRepairRaw: "", fireSafetyImpact: "", environmentSafetyImpact: "", severityRaw: "3", conditionRaw: "A",
  sourceStatusRaw: "Chưa xử lý", completedAtRaw: "", noteRaw: "",
};

test("pull Google cùng khóa không phục hồi hoặc sửa nội dung phiếu đã ẩn", async context => {
  const prepared = prepareDefectSourceRecords([record]);
  const row = { id: "hidden", sourceKey: prepared[0].sourceKey, syncState: "HIDDEN", cancelledAt: null, pendingHistory: null };
  const writes: Array<{ data: Record<string, unknown> }> = [];
  // Delegate Prisma là proxy, không có descriptor để context.mock.method thay thế.
  const replace = (delegate: object, key: string, implementation: unknown) => {
    const target = delegate as Record<string, unknown>;
    const original = target[key];
    target[key] = implementation;
    context.after(() => { target[key] = original; });
  };
  replace(prisma.defectSyncSetting, "findUnique", async () => ({ twoWaySyncEnabled: true, operationUpdateEnabled: true }));
  replace(prisma.defectSyncOutbox, "findMany", async () => []);
  replace(prisma.defect, "findMany", async (args: { where?: { sourceKey?: unknown } }) => args.where?.sourceKey ? [row] : []);
  replace(prisma.defect, "updateMany", async (args: { data: Record<string, unknown> }) => { writes.push(args); return { count: 1 }; });
  replace(prisma.defect, "createMany", async () => { assert.fail("Không được tạo lại phiếu đã ẩn"); });
  const result = await upsertPreparedDefectRecords({ prepared, creator: { id: "test-user" } });
  assert.equal(result.createdCount, 0);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.unchangedCount, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0].data).sort(), ["sourceLastSeenAt", "sourceSyncedAt"]);
});
