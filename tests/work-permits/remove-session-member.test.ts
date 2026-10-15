import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { removeSessionMember } from "../../lib/server/work-permit-attendance";

// Ca thật 15/10/2026: cùng người Lê Trọng Lương hai hồ sơ "249" (quét nhầm, đã RA) và "NPS/249" (đang trong).
const at = (time: string) => `2026-10-15T${time}:00.000Z`;
function fixture() {
  const session = { id: "s", permitId: "p", endedAt: null, commanderId: "c", commanderCode: "NPS/194", members: [
    { personId: "dup", code: "249", name: "Lê Trọng Lương", company: "NPS", attendance: [{ in: at("00:45"), out: at("04:09") }] },
    { personId: "real", code: "NPS/249", name: "Lê Trọng Lương", company: "NPS", attendance: [{ in: at("04:08"), out: null }] },
    { code: "", name: "Người ghi tay", company: "NPS", attendance: [] },
  ] };
  const permit = { members: [{ personId: "dup", code: "249", name: "Lê Trọng Lương", company: "NPS" }, { personId: "real", code: "NPS/249", name: "Lê Trọng Lương", company: "NPS" }] };
  const writes = { session: 0, permit: 0 };
  const tx = { $executeRaw: async () => 1, $queryRaw: async () => [],
    workPermitSession: {
      findFirst: async () => structuredClone(session),
      update: async ({ data }: { data: { members: typeof session.members } }) => { writes.session++; session.members = data.members; return session; },
    },
    workPermit: {
      findUnique: async () => structuredClone(permit),
      update: async ({ data }: { data: { members: typeof permit.members } }) => { writes.permit++; permit.members = data.members; return permit; },
    },
  } as unknown as Prisma.TransactionClient;
  return { session, permit, tx, writes };
}

test("gỡ người đã RA: mất khỏi lần làm việc (kèm lượt vào/ra) và khỏi danh sách trên phiếu", async () => {
  const f = fixture();
  const result = await removeSessionMember(f.tx, { permitId: "p", sessionId: "s", personId: "dup" });
  assert.equal(result.visits, 1);
  assert.equal(result.removedFromPermit, 1);
  assert.deepEqual(f.session.members.map(m => m.personId ?? m.name), ["real", "Người ghi tay"]);
  assert.deepEqual(f.permit.members.map(m => m.personId), ["real"]);
});

test("người còn trong khu vực thì chặn, không ghi gì", async () => {
  const f = fixture();
  await assert.rejects(removeSessionMember(f.tx, { permitId: "p", sessionId: "s", personId: "real" }), (error: unknown) => error instanceof Response && error.status === 400);
  assert.deepEqual(f.writes, { session: 0, permit: 0 });
});

test("người ghi tay chưa quét: gỡ theo vị trí + họ tên; sai tên thì 404", async () => {
  const f = fixture();
  await assert.rejects(removeSessionMember(f.tx, { permitId: "p", sessionId: "s", index: 2, name: "Tên khác" }), (error: unknown) => error instanceof Response && error.status === 404);
  const result = await removeSessionMember(f.tx, { permitId: "p", sessionId: "s", index: 2, name: "Người ghi tay" });
  assert.equal(result.removedFromPermit, 0);
  assert.equal(f.writes.permit, 0);
  assert.equal(f.session.members.length, 2);
});
