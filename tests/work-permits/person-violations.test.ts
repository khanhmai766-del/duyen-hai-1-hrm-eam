import assert from "node:assert/strict";
import test from "node:test";
import type { prisma } from "../../lib/prisma";
import { changePermitPersonViolation, recordPermitPersonViolation, requireViolationSessionMember, setPermitPersonCardRevoked } from "../../lib/server/work-permit-person-violations";
import { assertCardsNotRevoked } from "../../lib/server/work-permit-presence";
import { recordAttendance } from "../../lib/server/work-permit-attendance";
import { personCardRevokedMessage } from "../../lib/work-permits";
import { canChangePermitViolation } from "../../lib/work-permit-positions";

function fixture(person: { version: number; violations: readonly unknown[] } | null) {
  const calls: string[] = [];
  let update: { data: { violations: Array<Record<string, unknown>>; version: unknown } } | undefined;
  const tx = {
    $queryRaw: async () => { calls.push("lock"); },
    workPermitPerson: {
      findUnique: async () => { calls.push("read"); return person; },
      update: async (args: NonNullable<typeof update>) => { calls.push("write"); update = args; return args.data; },
    },
  };
  const db = { $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as typeof prisma;
  return { db, calls, update: () => update };
}
const user = { id: "recorder", name: "Người ghi nhận" };
const admin = { role: "ADMIN" };

test("Người xem không giữ cương vị chỉ huy ca bị từ chối sửa/xóa trước khi đọc DB", async () => {
  for (const user of [{ role: "VIEWER" }, { role: "VIEWER", position: "Trực chính lò" }]) {
    for (const action of ["edit", "delete"] as const) {
      const state = fixture({ version: 1, violations: [] });
      await assert.rejects(changePermitPersonViolation("worker", { violationId: "old", version: 1, description: "Lỗi mới" }, user, action, state.db), (e: unknown) => e instanceof Response && e.status === 403);
      assert.deepEqual(state.calls, []);
    }
  }
});

test("Quản trị, Quản lý, Trưởng ca, Kỹ thuật viên và cương vị Trưởng ca/Trưởng kíp được sửa/xóa", () => {
  for (const user of [{ role: "ADMIN" }, { role: "MANAGER" }, { role: "SUPERVISOR" }, { role: "TECHNICIAN" }, { role: "VIEWER", position: "Trưởng ca" }, { role: "VIEWER", position: "TK Lò máy" }, { role: "VIEWER", position: "Trưởng kíp điện" }])
    assert.equal(canChangePermitViolation(user), true, JSON.stringify(user));
});

test("Sửa đúng lần vi phạm, giữ người/ngày ghi nhận và liên kết PCT", async () => {
  const old = { id: "old", description: "Lỗi cũ", recordedById: "author", recordedAt: "2026-10-16", permitId: "pct", sessionId: "session", permitNumber: "1/2026" };
  const other = { id: "other", description: "Lỗi khác" };
  const state = fixture({ version: 2, violations: [old, other] });
  await changePermitPersonViolation("worker", { violationId: "old", version: 2, description: "  Nội dung đã sửa  ", recordedById: "fake", permitId: "fake" }, admin, "edit", state.db);
  assert.deepEqual(state.calls, ["lock", "read", "write"]);
  assert.deepEqual(state.update()!.data.violations, [{ ...old, description: "Nội dung đã sửa" }, other]);
  assert.deepEqual(state.update()!.data.version, { increment: 1 });
});

test("Xóa đúng lần và cho phép xóa lần cuối về danh sách trống", async () => {
  const old = { id: "old", description: "Lỗi cũ" }, other = { id: "other", description: "Lỗi khác" };
  for (const history of [[old, other], [old]]) {
    const state = fixture({ version: 2, violations: history });
    await changePermitPersonViolation("worker", { violationId: "old", version: 2 }, admin, "delete", state.db);
    assert.deepEqual(state.update()!.data.violations, history.filter(v => v.id !== "old"));
  }
});

test("Sửa/xóa không ghi đè hồ sơ cũ và không xử lý lần vi phạm của người khác", async () => {
  for (const action of ["edit", "delete"] as const) {
    for (const [person, status] of [[{ version: 3, violations: [{ id: "old" }] }, 409], [{ version: 2, violations: [{ id: "other" }] }, 404], [null, 404]] as const) {
      const state = fixture(person);
      await assert.rejects(changePermitPersonViolation("worker", { violationId: "old", version: 2, description: "Lỗi mới" }, admin, action, state.db), (e: unknown) => e instanceof Response && e.status === status);
      assert.equal(state.update(), undefined);
    }
  }
});

test("Chặn nội dung sửa không hợp lệ và mã lần vi phạm thiếu", async () => {
  for (const body of [{ violationId: "" }, { violationId: null }, { violationId: "old", description: " " }, { violationId: "old", description: "x".repeat(2001) }]) {
    const state = fixture({ version: 1, violations: [] });
    await assert.rejects(changePermitPersonViolation("worker", body, admin, "edit", state.db), (e: unknown) => e instanceof Response && e.status === 400);
    assert.deepEqual(state.calls, []);
  }
});

test("Ghi thêm một lỗi, giữ lịch sử và người ghi nhận; khóa trước khi đọc", async () => {
  const previous = { id: "old", description: "Không đội mũ bảo hộ" };
  const state = fixture({ version: 2, violations: [previous] });
  await recordPermitPersonViolation("worker", { description: "  Ra ngoài phạm vi PCT  ", version: 2 }, user, state.db);
  assert.deepEqual(state.calls, ["lock", "read", "write"]);
  const data = state.update()!.data;
  assert.equal(data.violations.length, 2);
  assert.deepEqual(data.violations[0], previous);
  assert.equal(data.violations[1].description, "Ra ngoài phạm vi PCT");
  assert.equal(data.violations[1].recordedById, user.id);
  assert.equal(data.violations[1].recordedByName, user.name);
  assert.ok(Number.isFinite(Date.parse(String(data.violations[1].recordedAt))));
  assert.deepEqual(data.version, { increment: 1 });
});

test("Từ chối hồ sơ cũ hoặc không tồn tại mà không ghi dữ liệu", async () => {
  for (const [person, status] of [[{ version: 3, violations: [] }, 409], [null, 404]] as const) {
    const state = fixture(person);
    await assert.rejects(recordPermitPersonViolation("worker", { description: "Lỗi", version: 2 }, user, state.db), (error: unknown) => error instanceof Response && error.status === status);
    assert.equal(state.update(), undefined);
  }
});

test("Từ chối lỗi trống, sai kiểu hoặc quá dài trước khi truy cập dữ liệu", async () => {
  for (const description of ["", "   ", null, 123, "x".repeat(2001)]) {
    const state = fixture({ version: 1, violations: [] });
    await assert.rejects(recordPermitPersonViolation("worker", { description, version: 1 }, user, state.db), (error: unknown) => error instanceof Response && error.status === 400);
    assert.deepEqual(state.calls, []);
  }
});


test("Ghi nhanh từ PCT giữ số phiếu và lần làm việc trong lịch sử chung", async () => {
  const state = fixture({ version: 1, violations: [] });
  const context = { permitId: "permit", sessionId: "session", permitNumber: "123/2026/VH1-NĐDH" };
  await recordPermitPersonViolation("worker", { description: "Không sử dụng bảo hộ", version: 1 }, user, state.db, context);
  const saved = state.update()!.data.violations[0];
  assert.equal(saved.permitId, context.permitId);
  assert.equal(saved.sessionId, context.sessionId);
  assert.equal(saved.permitNumber, context.permitNumber);
});

const leader = { id: "leader", name: "Trưởng kíp", role: "SUPERVISOR" };
const revokeFixture = (person: { version: number; violations: readonly unknown[]; cardRevokedAt?: Date | null } | null) => {
  let data: Record<string, unknown> | undefined;
  const tx = { $queryRaw: async () => [], workPermitPerson: { findUnique: async () => person, update: async (args: { data: Record<string, unknown> }) => { data = args.data; return args.data; } } };
  return { db: { $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as typeof prisma, data: () => data };
};

test("Không cho phép: thu thẻ, ghi thêm lỗi vừa nhập trong cùng thao tác", async () => {
  const old = { id: "old", description: "Lỗi cũ" };
  const state = revokeFixture({ version: 2, violations: [old] });
  await setPermitPersonCardRevoked("worker", { version: 2, description: " Hút thuốc " }, leader, true, state.db);
  const data = state.data()! as { cardRevokedAt: Date; cardRevokedByName: string; violations: Array<{ description: string }> };
  assert.ok(data.cardRevokedAt instanceof Date);
  assert.equal(data.cardRevokedByName, leader.name);
  assert.deepEqual(data.violations.map(v => v.description), ["Lỗi cũ", "Hút thuốc"]);
});

test("Không cho phép: từ chối khi chưa có lỗi nào, thiếu quyền, hồ sơ cũ hoặc đã thu thẻ", async () => {
  for (const [person, by, status] of [
    [{ version: 1, violations: [] }, leader, 400],
    [{ version: 1, violations: [{ id: "old" }] }, { ...leader, role: "VIEWER" }, 403],
    [{ version: 9, violations: [{ id: "old" }] }, leader, 409],
    [{ version: 1, violations: [{ id: "old" }], cardRevokedAt: new Date() }, leader, 409],
  ] as const) {
    const state = revokeFixture(person);
    await assert.rejects(setPermitPersonCardRevoked("worker", { version: 1 }, by, true, state.db), (e: unknown) => e instanceof Response && e.status === status);
    assert.equal(state.data(), undefined);
  }
});

test("Cho phép lại: xóa dấu thu thẻ, giữ nguyên lịch sử vi phạm", async () => {
  const state = revokeFixture({ version: 1, violations: [{ id: "old" }], cardRevokedAt: new Date() });
  await setPermitPersonCardRevoked("worker", { version: 1, description: "không được ghi" }, leader, false, state.db);
  assert.deepEqual(state.data(), { cardRevokedAt: null, cardRevokedByName: "", version: { increment: 1 } });
});

test("Cảnh báo thu thẻ ghi đúng tên, đơn vị và số PCT", async () => {
  const revoked = { name: "Nguyễn Quyết Thắng", company: "Sesan3A" };
  const expected = "Nguyễn Quyết Thắng (Sesan3A) đã vi phạm quá số lần cho phép và đã bị thu thẻ, không thể tiếp tục tham gia thực hiện PCT 123/2026/VH1-NĐDH.";
  assert.equal(personCardRevokedMessage(revoked, "123/2026/VH1-NĐDH"), expected);
  const tx = { workPermitPerson: { findFirst: async () => revoked } } as never;
  const rejected = await assertCardsNotRevoked(tx, [{ personId: "worker" }], { number: "123", year: 2026 }).catch((e: unknown) => e);
  assert.ok(rejected instanceof Response);
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error, expected);
  // Người nhập tay không có hồ sơ: không truy vấn.
  await assertCardsNotRevoked({} as never, [{}]);
});

test("Quét thẻ: người bị thu thẻ không VÀO được kể cả đã có trong lần làm việc, nhưng vẫn RA được", async () => {
  const at = "2026-10-02T01:00:00.000Z";
  const person = { id: "a", code: "A", name: "An", company: "Marine", isActive: true, scope: "SCTX", cardRevokedAt: new Date() };
  const run = async (members: unknown[], direction: "in" | "out") => {
    const writes: unknown[] = [];
    const tx = {
      $executeRaw: async () => 1, $queryRaw: async () => [],
      workPermitSession: {
        findFirst: async () => ({ id: "s1", permitId: "p1", endedAt: null, commanderId: "c1", members, searchText: "", permit: { teamName: "Marine", number: "7", year: 2026, contractorScope: "SCTX" } }),
        findMany: async () => [], update: async (args: unknown) => { writes.push(args); },
      },
      workPermitPerson: { findUnique: async () => person, findFirst: async () => person },
    } as never;
    return { writes, result: recordAttendance(tx, { permitId: "p1", sessionId: "s1", personId: "a", direction, now: new Date("2026-10-02T03:00:00.000Z") }) };
  };
  const member = { personId: "a", code: "A", name: "An", company: "Marine" };
  for (const members of [[], [{ ...member, attendance: [{ in: at, out: "2026-10-02T02:00:00.000Z" }] }]]) {
    const { result, writes } = await run(members, "in");
    await assert.rejects(result, (e: unknown) => e instanceof Response && e.status === 403);
    assert.equal(writes.length, 0);
  }
  const out = await run([{ ...member, attendance: [{ in: at, out: null }] }], "out");
  assert.equal((await out.result).outcome, "OUT");
});

test("Chỉ cho ghi lỗi với nhân viên có liên kết hồ sơ trong lần làm việc", () => {
  assert.doesNotThrow(() => requireViolationSessionMember([{ personId: "worker" }], "worker"));
  for (const members of [null, {}, [], [null], [{ personId: "other" }], [{ name: "worker", code: "worker" }]])
    assert.throws(() => requireViolationSessionMember(members, "worker"), (error: unknown) => error instanceof Response && error.status === 403);
});
