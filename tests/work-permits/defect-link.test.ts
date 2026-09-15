import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { resolvePermitDefectLink } from "../../lib/server/work-permits";

function fixture(row: { id: string; requestNumber: string | null; cancelledAt: Date | null } | null) {
  let reads = 0;
  const tx = { defect: { findUnique: async () => { reads++; return row; } } } as unknown as Prisma.TransactionClient;
  return { tx, reads: () => reads };
}

test("liên kết giữ nguyên giữ snapshot, không đọc SYC đã xóa", async () => {
  const mock = fixture(null);
  const result = await resolvePermitDefectLink(mock.tx,
    { defectId: "old", repairRequestNumber: "số gửi lệch", status: "CANCELLED" },
    { defectId: "old", repairRequestNumber: "12/2026" });
  assert.equal(result.repairRequestNumber, "12/2026");
  assert.equal(result.defectId, "old");
  assert.equal(mock.reads(), 0);
});

test("SYC đã hủy không làm kẹt cập nhật PCT giữ nguyên liên kết", async () => {
  const mock = fixture({ id: "old", requestNumber: "99/2026", cancelledAt: new Date() });
  const result = await resolvePermitDefectLink(mock.tx, { defectId: "old" },
    { defectId: "old", repairRequestNumber: "12/2026" });
  assert.equal(result.repairRequestNumber, "12/2026");
  assert.equal(mock.reads(), 0);
});

test("tạo liên kết lấy số SYC từ DB, không nhận số giả từ client", async () => {
  const mock = fixture({ id: "new", requestNumber: " 34/2026 ", cancelledAt: null });
  const result = await resolvePermitDefectLink(mock.tx, { defectId: "new", repairRequestNumber: "giả" });
  assert.equal(result.repairRequestNumber, "34/2026");
  assert.equal(mock.reads(), 1);
});

test("tạo/đổi liên kết không nhận SYC đã hủy, thiếu hoặc chưa có số", async () => {
  for (const row of [null, { id: "new", requestNumber: "34/2026", cancelledAt: new Date() },
    { id: "new", requestNumber: " ", cancelledAt: null }]) {
    for (const before of [undefined, { defectId: "old", repairRequestNumber: "12/2026" }]) {
      await assert.rejects(resolvePermitDefectLink(fixture(row).tx, { defectId: "new" }, before),
        (error: unknown) => error instanceof Response && error.status === 400);
    }
  }
});

test("gỡ liên kết giữ số đối chiếu nhập tay và không đọc DB", async () => {
  const mock = fixture(null);
  const result = await resolvePermitDefectLink(mock.tx, { defectId: null, repairRequestNumber: "56/2026" },
    { defectId: "old", repairRequestNumber: "12/2026" });
  assert.equal(result.defectId, null);
  assert.equal(result.repairRequestNumber, "56/2026");
  assert.equal(mock.reads(), 0);
});

test("PCT không liên kết vẫn sửa số SYC đối chiếu được", async () => {
  const result = await resolvePermitDefectLink(fixture(null).tx, { defectId: null, repairRequestNumber: "56/2026" },
    { defectId: null, repairRequestNumber: "12/2026" });
  assert.equal(result.repairRequestNumber, "56/2026");
});
