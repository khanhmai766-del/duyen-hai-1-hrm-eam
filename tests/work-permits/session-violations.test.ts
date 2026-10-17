import assert from "node:assert/strict";
import test from "node:test";
import type { prisma } from "../../lib/prisma";
import { loadPermitSessionViolations } from "../../lib/server/work-permit-session-violations";

function fixture(members: unknown, found = true) {
  const reads: unknown[] = [];
  const current = [
    { id: "worker", violations: [{ id: "new", description: "Không sử dụng dây an toàn" }], photoKey: "work-permit-people/photos/worker.webp", photoSource: "nguon-anh-1" },
    { id: "second", violations: [], photoKey: null, photoSource: "" },
  ];
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
    { where: { id: { in: ["worker", "second"] } }, select: { id: true, violations: true, photoKey: true, photoSource: true } },
  ]);
  assert.deepEqual(result[0].violations, state.current[0].violations);
  assert.match(result[0].photoUrl!, /^\/api\/files\/s3\?key=work-permit-people%2Fphotos%2Fworker.webp&v=[a-f0-9]{8}$/);
  assert.equal(result[1].photoUrl, null);
  assert.ok(!("photoKey" in result[0]) && !("photoSource" in result[0]));
});

test("URL giữ nguyên khi ảnh không đổi, đổi phiên bản khi nguồn ảnh đổi", async () => {
  const state = fixture([{ personId: "worker" }]);
  const first = await loadPermitSessionViolations("permit", "session", state.db);
  assert.equal((await loadPermitSessionViolations("permit", "session", state.db))[0].photoUrl, first[0].photoUrl);
  state.current[0].photoSource = "nguon-anh-2";
  assert.notEqual((await loadPermitSessionViolations("permit", "session", state.db))[0].photoUrl, first[0].photoUrl);
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
