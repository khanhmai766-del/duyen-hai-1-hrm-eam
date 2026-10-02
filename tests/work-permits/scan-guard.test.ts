import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { PermitCameraScanGuard } from "../../lib/work-permit-scan-guard";
import { recordAttendance } from "../../lib/server/work-permit-attendance";

test("giữ cùng QR trước camera 90 giây chỉ nhận một lượt", () => {
  const guard = new PermitCameraScanGuard();
  assert.equal(guard.observe("A", 1000), true);
  guard.accept("A");
  for (let at = 1600; at <= 91000; at += 600) assert.equal(guard.observe("A", at), false);
});

test("mất QR ngắn không mở lại; rời khung một giây hoặc đổi thẻ thì nhận lượt mới", () => {
  const guard = new PermitCameraScanGuard();
  guard.observe("A", 1000); guard.accept("A");
  guard.observe(null, 1300);
  assert.equal(guard.observe("A", 1800), false);
  assert.equal(guard.observe("B", 1900), true);
  guard.accept("B");
  guard.observe(null, 2900);
  assert.equal(guard.observe("B", 3000), true);
});

test("quan sát khi đang bận chưa tiêu thụ lượt; đóng camera xoá khoá thẻ", () => {
  const guard = new PermitCameraScanGuard();
  assert.equal(guard.observe("A", 1000), true);
  assert.equal(guard.observe("A", 1600), true);
  guard.accept("A");
  guard.reset();
  assert.equal(guard.observe("A", 1700), true);
});

const entered = "2026-10-02T01:00:00.000Z";
const exited = "2026-10-02T02:00:00.000Z";
function fixture(out: string | null) {
  const session = { id: "s", permitId: "p", endedAt: null, commanderId: "c", searchText: "",
    permit: { teamName: "A", status: "ISSUED" },
    members: [{ personId: "a", code: "A", name: "Nguyễn An", company: "A", attendance: [{ in: entered, out }] }] };
  let writes = 0;
  const tx = { $executeRaw: async () => 1, $queryRaw: async () => [], workPermitSession: {
    findFirst: async () => structuredClone(session),
    findMany: async () => [],
    update: async ({ data }: { data: { members: typeof session.members } }) => { writes++; session.members = data.members; return session; },
  } } as unknown as Prisma.TransactionClient;
  return { session, tx, writes: () => writes };
}

for (const delay of [2500, 59999]) test(`quét lại sau RA ${delay}ms không ghi VÀO hoặc đổi lịch sử`, async () => {
  const f = fixture(exited);
  const original = structuredClone(f.session.members);
  const result = await recordAttendance(f.tx, { permitId: "p", sessionId: "s", personId: "a", direction: "auto", now: new Date(Date.parse(exited) + delay) });
  assert.equal(result.outcome, "TOO_SOON_AFTER_OUT");
  assert.equal(result.inside, 1);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.session.members, original);
});

test("đủ 60 giây sau RA được VÀO lại, quét tiếp ngay không đảo thành RA", async () => {
  const f = fixture(exited);
  const now = new Date(Date.parse(exited) + 60000);
  const input = { permitId: "p", sessionId: "s", personId: "a", direction: "auto" as const, now };
  assert.equal((await recordAttendance(f.tx, input)).outcome, "IN");
  assert.equal((await recordAttendance(f.tx, { ...input, now: new Date(now.getTime() + 2500) })).outcome, "TOO_SOON");
  assert.equal(f.writes(), 1);
  assert.equal(f.session.members[0].attendance.length, 2);
});

test("nút Vào lại chủ động cho phép vào ngay sau RA", async () => {
  const f = fixture(exited);
  assert.equal((await recordAttendance(f.tx, { permitId: "p", sessionId: "s", personId: "a", direction: "in", now: new Date(Date.parse(exited) + 1000) })).outcome, "IN");
  assert.equal(f.writes(), 1);
});
