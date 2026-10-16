import assert from "node:assert/strict";
import test from "node:test";
import type { prisma } from "../../lib/prisma";
import { loadPermitSessionViolations } from "../../lib/server/work-permit-session-violations";

function fixture(members: unknown, found = true) {
  const reads: unknown[] = [];
  const current = [{ id: "worker", violations: [{ id: "new", description: "Không sử dụng dây an toàn" }] }];
  const db = {
    workPermitSession: { findFirst: async (args: unknown) => { reads.push(args); return found ? { members } : null; } },
    workPermitPerson: { findMany: async (args: unknown) => { reads.push(args); return current; } },
  } as unknown as typeof prisma;
  return { db, reads, current };
}

test("Đọc lịch sử hiện tại cho toàn bộ người liên kết bằng một truy vấn, không dùng snapshot", async () => {
  const state = fixture([{ personId: "worker", name: "Tên cũ", violations: [] }, { personId: "worker" }, { personId: "second" }, { name: "worker", code: "worker" }, null]);
  const result = await loadPermitSessionViolations("permit", "session", state.db);
  assert.deepEqual(state.reads, [
    { where: { id: "session", permitId: "permit" }, select: { members: true } },
    { where: { id: { in: ["worker", "second"] } }, select: { id: true, violations: true } },
  ]);
  assert.deepEqual(result, state.current);
});

test("Danh sách thiếu liên kết không suy đoán người theo tên hoặc số thẻ", async () => {
  for (const members of [null, {}, [null, 1, [], { personId: "" }, { personId: 3 }, { name: "worker", code: "worker" }]]) {
    const state = fixture(members);
    assert.deepEqual(await loadPermitSessionViolations("permit", "session", state.db), []);
    assert.equal(state.reads.length, 1);
  }
});

test("Lần làm việc không thuộc phiếu không được đọc lịch sử nhân viên", async () => {
  const state = fixture([], false);
  await assert.rejects(loadPermitSessionViolations("other-permit", "session", state.db), (error: unknown) => error instanceof Response && error.status === 404);
  assert.equal(state.reads.length, 1);
});
