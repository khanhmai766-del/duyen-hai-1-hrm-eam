import assert from "node:assert/strict";
import test from "node:test";
import type { prisma } from "../../lib/prisma";
import { recordPermitPersonViolation, requireViolationSessionMember } from "../../lib/server/work-permit-person-violations";

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

test("Chỉ cho ghi lỗi với nhân viên có liên kết hồ sơ trong lần làm việc", () => {
  assert.doesNotThrow(() => requireViolationSessionMember([{ personId: "worker" }], "worker"));
  for (const members of [null, {}, [], [null], [{ personId: "other" }], [{ name: "worker", code: "worker" }]])
    assert.throws(() => requireViolationSessionMember(members, "worker"), (error: unknown) => error instanceof Response && error.status === 403);
});
