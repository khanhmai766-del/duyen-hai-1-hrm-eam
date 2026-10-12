import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { Prisma, WorkPermit, WorkPermitSession, WorkPermitTelegramOutbox } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { enqueueOverhaulEnding, enqueueOverhaulOpening, runOverhaulTelegramOutbox } from "../../lib/server/work-permit-telegram";
import { deliverTelegramNotification } from "../../lib/telegram";

const at = (time: string) => new Date(`2026-10-12T${time}+07:00`);
const permit = { id: "p1", number: "4299", year: 2026, position: "Lò phó", content: "Đại tu bơm", teamName: "Nhà thầu A", teamType: "CONTRACTOR", contractorScope: "OVERHAUL", overhaulItems: [] } as unknown as WorkPermit;
const person = (id: string) => ({ personId: id, code: id, name: id, company: "Nhà thầu A", attendance: [{ in: at("08:10:00").toISOString(), out: at("08:40:00").toISOString() }] });
const session = { id: "s1", permitId: "p1", commanderId: "ch1", commanderCode: "ch1", commanderName: "Chỉ huy", company: "Nhà thầu A",
  openedAt: at("08:00:00"), endedAt: null, members: [person("w1")], itemProgress: null, endNote: "" } as unknown as WorkPermitSession;
const success = () => ({ enabled: true, allSucceeded: true, sent: 1, skipped: 0, busy: 0, failed: 0, errors: [] });
const failed = () => ({ ...success(), allSucceeded: false, sent: 0, failed: 1, errors: ["Lỗi giả lập"] });

function matches(value: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return (expected as Record<string, unknown>[]).some(condition => matches(value, condition));
    const actual = value[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === "object") {
      const op = expected as { in?: unknown[]; lte?: Date };
      if (op.in) return op.in.includes(actual);
      if (op.lte) return actual instanceof Date && actual.getTime() <= op.lte.getTime();
    }
    return actual === expected;
  });
}

function harness(t: TestContext, chats = "a,b") {
  const savedEnv = { feature: process.env.TELEGRAM_OVERHAUL_ENABLED, enabled: process.env.TELEGRAM_ALERT_ENABLED, chats: process.env.TELEGRAM_OVERHAUL_CHAT_IDS };
  process.env.TELEGRAM_OVERHAUL_ENABLED = "true";
  process.env.TELEGRAM_ALERT_ENABLED = "true";
  process.env.TELEGRAM_OVERHAUL_CHAT_IDS = chats;
  t.after(() => {
    for (const [key, value] of [["TELEGRAM_OVERHAUL_ENABLED", savedEnv.feature], ["TELEGRAM_ALERT_ENABLED", savedEnv.enabled], ["TELEGRAM_OVERHAUL_CHAT_IDS", savedEnv.chats]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  });
  const rows: WorkPermitTelegramOutbox[] = [];
  const sentOpening = new Set<string>();
  let writes = 0;
  let current = { ...session, permit };
  const queue = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row as unknown as Record<string, unknown>, where)).map(row => ({ ...row })),
    findUnique: async ({ where }: { where: { id?: string; dedupeKey?: string } }) => rows.find(row => where.id ? row.id === where.id : row.dedupeKey === where.dedupeKey) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { const row = rows.find(row => row.id === where.id); assert.ok(row); return { ...row }; },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of rows) if (matches(row as unknown as Record<string, unknown>, where)) {
        const next = { ...data };
        if (typeof next.attemptCount === "object") next.attemptCount = row.attemptCount + (next.attemptCount as { increment: number }).increment;
        Object.assign(row, next); count++; writes++;
      }
      return { count };
    },
    upsert: async ({ where, create }: { where: { dedupeKey: string }; create: Partial<WorkPermitTelegramOutbox> }) => {
      const existing = rows.find(row => row.dedupeKey === where.dedupeKey);
      if (existing) return existing;
      const row = { id: `queue-${rows.length}`, state: "PENDING", attemptCount: 0, permitId: null, sessionId: null,
        claimedAt: null, completedAt: null, lastError: null, baseline: null, messages: null, message: null, combinedMessage: null,
        createdAt: at("08:00:00"), updatedAt: at("08:00:00"), ...create } as WorkPermitTelegramOutbox;
      rows.push(row); writes++; return row;
    },
  };
  const db = { workPermitTelegramOutbox: queue, workPermitSession: { findUnique: async () => current },
    telegramNotificationLog: { findMany: async () => [...sentOpening].map(chatId => ({ chatId })) } } as unknown as typeof prisma;
  return { rows, queue, db, tx: { workPermitTelegramOutbox: queue } as unknown as Prisma.TransactionClient, sentOpening,
    setSession: (value: typeof current) => { current = value; }, writes: () => writes };
}

test("Lưu lịch +1h, chưa đến giờ không gửi; số nhân viên lấy sau khi đã bổ sung", async t => {
  const h = harness(t, "a");
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  assert.equal(h.rows[0].dueAt.getTime(), at("09:00:00").getTime());
  const calls: string[] = [];
  const deliver = async (params: Parameters<typeof deliverTelegramNotification>[0]) => { calls.push(params.message); return success(); };
  await runOverhaulTelegramOutbox({ db: h.db, now: at("08:59:59"), deliver });
  assert.equal(calls.length, 0);
  h.setSession({ ...session, members: [person("w1"), person("w2")], permit });
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Số nhân viên công tác: <b>2<\/b>/);
  assert.equal(h.rows[0].state, "SUCCESS");
});

test("Kết thúc trước một giờ: huỷ lịch mở và gửi một bản gộp tới từng nhóm", async t => {
  const h = harness(t);
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  const ended = { ...session, endedAt: at("08:45:00") };
  await enqueueOverhaulEnding(h.tx, permit, ended, at("08:45:00"));
  h.setSession({ ...ended, permit });
  assert.equal(h.rows[0].state, "CANCELED");
  const calls: string[] = [];
  await runOverhaulTelegramOutbox({ db: h.db, now: at("08:45:00"), deliver: async params => { calls.push(params.message); return success(); } });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(message => message.includes("MỞ VÀ KẾT THÚC")));
  assert.equal(h.rows[1].state, "SUCCESS");
  await runOverhaulTelegramOutbox({ db: h.db, now: at("10:00:00"), deliver: async () => { assert.fail("Không gửi lại bản tin đã hoàn tất"); } });
});

test("Đã gửi mở cho một nhóm: nhóm đó nhận kết thúc; nhóm chưa nhận mở nhận bản gộp", async t => {
  const h = harness(t);
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  h.sentOpening.add("a");
  await enqueueOverhaulEnding(h.tx, permit, { ...session, endedAt: at("10:00:00") }, at("10:00:00"));
  const received = new Map<string, string>();
  await runOverhaulTelegramOutbox({ db: h.db, now: at("10:00:00"), deliver: async params => { received.set(params.chatIds![0], params.message); return success(); } });
  assert.match(received.get("a")!, /<b>KẾT THÚC NGÀY ĐẠI TU/);
  assert.match(received.get("b")!, /MỞ VÀ KẾT THÚC/);
});

test("Hai worker chạy đồng thời chỉ một worker claim và gửi", async t => {
  const h = harness(t, "a");
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  let sends = 0;
  const deliver = async () => { sends++; return success(); };
  await Promise.all([runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver }), runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver })]);
  assert.equal(sends, 1);
});

test("Lỗi giữa các đoạn: giữ nội dung và khoá từng đoạn khi thử lại sau reload", async t => {
  const h = harness(t, "a");
  await h.queue.upsert({ where: { dedupeKey: "D:2026-10-11" }, create: { dedupeKey: "D:2026-10-11", kind: "DAILY", dueAt: at("00:00:00"), nextAttemptAt: at("00:00:00"), message: Array.from({ length: 80 }, (_, i) => `${i}. ${"Nội dung ".repeat(10)}`).join("\n") } });
  const delivered = new Set<string>();
  const attempts: string[] = [];
  let first = true;
  const deliver = async (params: Parameters<typeof deliverTelegramNotification>[0]) => {
    attempts.push(params.periodKey);
    if (delivered.has(params.periodKey)) return { ...success(), sent: 0, skipped: 1 };
    if (first && params.periodKey.endsWith(":1")) { first = false; return failed(); }
    delivered.add(params.periodKey); return success();
  };
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver });
  assert.equal(h.rows[0].state, "FAILED");
  const frozen = JSON.stringify(h.rows[0].messages);
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:01:00"), deliver });
  assert.equal(h.rows[0].state, "SUCCESS");
  assert.equal(JSON.stringify(h.rows[0].messages), frozen);
  assert.equal(attempts.filter(key => key.endsWith(":0")).length, 2);
  assert.ok(delivered.size >= 2);
});

test("Dry-run trả nội dung nhưng không claim, không ghi DB và không gọi Telegram", async t => {
  const h = harness(t, "a");
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  const before = h.writes();
  const result = await runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), dryRun: true, deliver: async () => { assert.fail("Dry-run không gửi"); } });
  assert.equal(result.results[0].state, "PREVIEW");
  assert.equal(h.writes(), before);
  assert.equal(h.rows[0].state, "PENDING");
});
test("Ngừng thử lại gửi tới nhóm đã được gỡ khỏi cấu hình", async t => {
  const h = harness(t);
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver: async () => failed() });
  assert.equal(h.rows[0].state, "FAILED");
  process.env.TELEGRAM_OVERHAUL_CHAT_IDS = "a";
  const chats: string[] = [];
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:01:00"), deliver: async params => { chats.push(...params.chatIds!); return success(); } });
  assert.deepEqual(chats, ["a"]);
  assert.equal(h.rows[0].state, "SUCCESS");
});
test("Hết ngân sách thời gian giữ lại các đoạn chưa gửi để tiếp tục ở lượt sau", async t => {
  const h = harness(t, "a");
  let clock = 0;
  t.mock.method(Date, "now", () => clock);
  await h.queue.upsert({ where: { dedupeKey: "D:2026-10-11" }, create: { dedupeKey: "D:2026-10-11", kind: "DAILY", dueAt: at("00:00:00"), nextAttemptAt: at("00:00:00"), message: Array.from({ length: 80 }, () => "Nội dung ".repeat(10)).join("\n") } });
  let calls = 0;
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver: async () => { calls++; clock = 45001; return success(); } });
  assert.equal(calls, 1);
  assert.equal(h.rows[0].state, "FAILED");
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:01:00"), deliver: async () => success() });
  assert.equal(h.rows[0].state, "SUCCESS");
});
test("Worker bị dừng có lease quá 10 phút được nhận lại", async t => {
  const h = harness(t, "a");
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  Object.assign(h.rows[0], { state: "PROCESSING", claimedAt: at("08:30:00"), attemptCount: 1 });
  await runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver: async () => success() });
  assert.equal(h.rows[0].state, "SUCCESS");
  assert.equal(h.rows[0].attemptCount, 2);
});
test("Kết thúc trong lúc mở đang gửi: chờ mở hoàn tất rồi chỉ gửi kết thúc", async t => {
  const h = harness(t, "a");
  await enqueueOverhaulOpening(h.tx, permit, session, new Map());
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const openingRun = runOverhaulTelegramOutbox({ db: h.db, now: at("09:00:00"), deliver: async params => {
    calls.push(params.message); started(); await waiting; h.sentOpening.add("a"); return success();
  } });
  await entered;
  await enqueueOverhaulEnding(h.tx, permit, { ...session, endedAt: at("10:00:00") }, at("10:00:00"));
  await runOverhaulTelegramOutbox({ db: h.db, now: at("10:00:00"), deliver: async () => { assert.fail("Chưa gửi kết thúc khi mở còn đang gửi"); } });
  assert.equal(h.rows[1].state, "PENDING");
  release(); await openingRun;
  await runOverhaulTelegramOutbox({ db: h.db, now: at("10:01:00"), deliver: async params => { calls.push(params.message); return success(); } });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /<b>KẾT THÚC NGÀY ĐẠI TU/);
  assert.doesNotMatch(calls[1], /MỞ VÀ KẾT THÚC/);
});
