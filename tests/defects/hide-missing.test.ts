import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { hideMissingDefect, HideMissingDefectError } from "../../lib/server/defect-hide";
import { canHideMissingDefect } from "../../lib/defect-visibility";

const updatedAt = new Date("2026-10-20T12:00:00Z");
const missing = {
  id: "sheet-copy", sourceType: "GOOGLE_SHEETS", syncState: "MISSING",
  status: "DA_XU_LY", cancelledAt: null, pendingHistory: null, updatedAt,
  device: null, system: "Lò phó S2", requestNumber: "2178/2026",
};

function fixture(patch = {}, queued = 0, updateCount = 1) {
  const writes: unknown[] = [];
  const existing = { ...missing, ...patch };
  // Chỉ cấp đúng khả năng được phép dùng: không có delete, enqueue hoặc sửa liên kết.
  const tx = {
    defect: {
      findUnique: async () => existing,
      updateMany: async (input: unknown) => { writes.push(input); return { count: updateCount }; },
    },
    defectSyncOutbox: { count: async () => queued },
  } as unknown as Prisma.TransactionClient;
  return { tx, existing, writes };
}

const params = { id: missing.id, updatedAt, canEdit: () => true };
const statusIs = (status: number) => (error: unknown) => error instanceof HideMissingDefectError && error.status === status;

test("phiếu mất nguồn đã xử lý vẫn ẩn được, không hủy hoặc đổi liên kết/số", async () => {
  const mock = fixture();
  assert.equal(canHideMissingDefect(mock.existing), true);
  const before = await hideMissingDefect(mock.tx, params);
  assert.equal(before.status, "DA_XU_LY");
  assert.equal(mock.writes.length, 1);
  assert.deepEqual((mock.writes[0] as { data: unknown }).data, { syncState: "HIDDEN" });
});

test("chỉ ẩn phiếu mất nguồn, không ẩn nhầm phiếu đang có nguồn hoặc đã vào lịch sử", async () => {
  for (const patch of [
    { sourceType: "MANUAL" }, { syncState: "ACTIVE" }, { syncState: "CONFIRMED" },
    { syncState: "HIDDEN" }, { cancelledAt: updatedAt }, { pendingHistory: { id: "history" } },
  ]) {
    const mock = fixture(patch);
    assert.equal(canHideMissingDefect(mock.existing), false);
    await assert.rejects(hideMissingDefect(mock.tx, params), statusIs(409));
    assert.equal(mock.writes.length, 0);
  }
});

test("không được ẩn phiếu ngoài phạm vi cương vị", async () => {
  const mock = fixture();
  await assert.rejects(hideMissingDefect(mock.tx, { ...params, canEdit: () => false }), statusIs(403));
  assert.equal(mock.writes.length, 0);
});

test("không ẩn khi phiên bản đã đổi hoặc khi còn sự kiện ghi Google", async () => {
  for (const mock of [fixture({ updatedAt: new Date(updatedAt.getTime() + 1) }), fixture({}, 1)]) {
    await assert.rejects(hideMissingDefect(mock.tx, params), statusIs(409));
    assert.equal(mock.writes.length, 0);
  }
});

test("không báo thành công nếu phiếu có nguồn trở lại giữa lúc đọc và cập nhật", async () => {
  await assert.rejects(hideMissingDefect(fixture({}, 0, 0).tx, params), statusIs(409));
});

test("phiếu không tồn tại trả 404", async () => {
  const tx = { defect: { findUnique: async () => null } } as unknown as Prisma.TransactionClient;
  await assert.rejects(hideMissingDefect(tx, params), statusIs(404));
});
