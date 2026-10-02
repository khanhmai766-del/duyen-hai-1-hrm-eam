import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { memberOccupiesWork, presentMembers, samePermitWorker } from "../../lib/work-permit-presence";
import { assertWorkersFree } from "../../lib/server/work-permit-presence";
import { recordAttendance } from "../../lib/server/work-permit-attendance";
import type { PermitMember } from "../../lib/work-permits";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as presence from "../../lib/server/work-permit-presence";
import * as attendance from "../../lib/server/work-permit-attendance";
import * as workers from "../../lib/work-permit-presence";
import { normalizeText } from "../../lib/nav";

const worker: PermitMember = { personId: "a", code: "A", name: "Nguyễn An", company: "Marine" };
const entered = "2026-10-02T01:00:00.000Z";
const exited = "2026-10-02T02:00:00.000Z";
const now = new Date("2026-10-02T03:00:00.000Z");
const inside = { ...worker, attendance: [{ in: entered, out: null }] };
const outside = { ...worker, attendance: [{ in: entered, out: exited }] };
const otherSession = (members: PermitMember[]) => ({ commanderId: "c2", commanderCode: "C2", commanderName: "CHTT khác", company: "Marine", members,
  permit: { id: "p2", number: "002", year: 2026, kind: "MECHANICAL" } });
async function conflictError(action: () => Promise<unknown>) {
  await assert.rejects(action, asyncError => asyncError instanceof Response && asyncError.status === 409);
}

test("chỉ người còn trong khu vực và hồ sơ cũ chưa theo dõi chiếm chỗ", () => {
  assert.equal(memberOccupiesWork(inside), true);
  assert.equal(memberOccupiesWork(outside), false);
  assert.equal(memberOccupiesWork({ ...worker, attendance: [] }), false);
  assert.equal(memberOccupiesWork(worker), true);
  assert.equal(presentMembers([null, inside, outside, worker]).length, 2);
});

test("khớp ID, mã thẻ hoặc tên/đơn vị cho nhân viên nhập tay", () => {
  assert.equal(samePermitWorker(worker, { ...worker, code: "MÃ ĐỔI" }), true);
  assert.equal(samePermitWorker(worker, { ...worker, personId: undefined, code: " a " }), true);
  assert.equal(samePermitWorker(worker, { code: "", name: "nguyen an", company: "marine" }), true);
  assert.equal(samePermitWorker(worker, { ...worker, personId: "b" }), false);
  assert.equal(samePermitWorker(worker, { code: "", name: worker.name, company: "Khác" }), false);
});

test("chặn nhân viên đang trong phiếu khác; bỏ qua người đã RA/chưa VÀO", async () => {
  let members: PermitMember[] = [inside];
  const tx = { workPermitSession: { findMany: async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { endedAt: null, permitId: { not: "p1" } });
    return [otherSession(members)];
  } } } as unknown as Prisma.TransactionClient;
  await conflictError(() => assertWorkersFree(tx, [worker], "p1"));
  members = [outside];
  await assertWorkersFree(tx, [worker], "p1");
  members = [{ ...worker, attendance: [] }];
  await assertWorkersFree(tx, [worker], "p1");
  members = [worker];
  await conflictError(() => assertWorkersFree(tx, [worker], "p1"));
});

test("CHTT không được đồng thời làm nhân viên trên phiếu khác", async () => {
  const tx = { workPermitSession: { findMany: async () => [{ ...otherSession([]), commanderId: worker.personId, commanderCode: worker.code, commanderName: worker.name }] } } as unknown as Prisma.TransactionClient;
  await conflictError(() => assertWorkersFree(tx, [worker], "p1"));
});

function attendanceFixture(existing: PermitMember[], occupied: PermitMember[] = [inside]) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: async () => { calls.push("presence-lock"); return 1; },
    $queryRaw: async () => { calls.push("session-lock"); return []; },
    workPermitSession: {
      findFirst: async () => { calls.push("read"); return { id: "s1", permitId: "p1", endedAt: null, commanderId: "c1", members: existing, searchText: "", permit: { teamName: "Marine" } }; },
      findMany: async () => { calls.push("conflict-check"); return [otherSession(occupied)]; },
      update: async () => { calls.push("write"); },
    },
    workPermitPerson: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "a"
      ? { id: "a", ...worker, isActive: true } : { company: "Marine" } },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

for (const direction of ["auto", "in"] as const) test(`vào lại qua ${direction} bị chặn ở server và không ghi lịch sử`, async () => {
  const f = attendanceFixture([outside]);
  await conflictError(() => recordAttendance(f.tx, { permitId: "p1", sessionId: "s1", personId: "a", direction, now }));
  assert.deepEqual(f.calls, ["presence-lock", "session-lock", "read", "conflict-check"]);
});

test("thêm người mới bị chặn dù gọi API trực tiếp", async () => {
  const f = attendanceFixture([]);
  await conflictError(() => recordAttendance(f.tx, { permitId: "p1", sessionId: "s1", personId: "a", direction: "in", now }));
  assert.equal(f.calls.includes("write"), false);
});

test("người nhập tay cũng bị chặn khi dùng nút Vào lại", async () => {
  const f = attendanceFixture([{ ...outside, personId: undefined, code: "" }]);
  await conflictError(() => recordAttendance(f.tx, { permitId: "p1", sessionId: "s1", index: 0, name: worker.name, direction: "in", now }));
  assert.equal(f.calls.includes("write"), false);
});

test("dữ liệu trùng cũ vẫn cho RA để giải phóng, không chặn lối ra", async () => {
  const f = attendanceFixture([inside]);
  assert.equal((await recordAttendance(f.tx, { permitId: "p1", sessionId: "s1", personId: "a", direction: "out", now })).outcome, "OUT");
  assert.equal(f.calls.includes("conflict-check"), false);
  assert.equal(f.calls.includes("write"), true);
});

test("đã RA khỏi phiếu khác thì vào phiếu mới được", async () => {
  const f = attendanceFixture([outside], [outside]);
  assert.equal((await recordAttendance(f.tx, { permitId: "p1", sessionId: "s1", personId: "a", direction: "in", now })).outcome, "IN");
  assert.equal(f.calls.includes("write"), true);
});

function lifecycleFixture(action: "open" | "handoff", previousMembers: PermitMember[] = [inside]) {
  let writes = 0;
  const locks: string[] = [];
  const person = { id: "c1", code: "C1", name: "CHTT mới", company: "Marine", isActive: true, canCommand: true };
  const old = { id: "s1", permitId: "p1", commanderId: "old-c", openedAt: new Date(entered), members: previousMembers };
  const permit = { id: "p1", teamType: "CONTRACTOR", version: 1, issuedAt: new Date(entered), status: action === "open" ? "ISSUED" : "ACTIVE", teamName: "Marine" };
  const tx = { $executeRaw: async (parts: TemplateStringsArray) => { locks.push(parts.join("")); return 1; },
    $queryRaw: async (parts: TemplateStringsArray) => { locks.push(parts.join("")); return []; },
    workPermit: { findUnique: async () => permit, update: async () => { writes++; return permit; } },
    workPermitPerson: { findUnique: async () => person },
    workPermitSession: {
      findFirst: async ({ where }: { where: { id?: string } }) => where.id === "s1" ? old : null,
      findMany: async () => [otherSession([inside])],
      update: async () => { writes++; return old; },
      create: async ({ data }: { data: Record<string, unknown> }) => { writes++; return { id: "new-s", ...data }; },
    }, workPermitHistory: { create: async () => { writes++; } },
  };
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const imports: Record<string, unknown> = {
    "@/lib/server/work-permit-scope": { requirePermitVisible: async () => {} },
    "@/lib/server/work-permit-permissions": { requirePermitExecute: async () => {} },
    "@/lib/nav": { normalizeText },
    "@/lib/prisma": { prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx), workPermit: { findUnique: async () => permit } } },
    "@/lib/api": { fail, ok: (data: unknown) => Response.json({ data }), requireUser: async () => ({ id: "operator", name: "Người cho phép" }), audit: async () => {} },
    "@/lib/server/work-permits": { permitBody: (request: Request) => request.json(), permitText: (body: Record<string, unknown>, key: string) => body[key] ?? "", permitSnapshot: (value: unknown) => value,
      permitHandle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (error) { if (error instanceof Response) return error; throw error; } } },
    "@/lib/server/work-permit-sessions": { validateSessionTime: () => {}, assertCommanderFree: async () => {},
      resolveSessionMembers: async (_tx: unknown, members: PermitMember[]) => members,
      readSessionOpen: () => ({ commanderId: person.id, authorizerName: "Người cho phép", openedAt: now, members: [worker] }) },
    "@/lib/work-permit-card": { sameCompany: (a: string, b: string) => a === b },
    "@/lib/server/work-permit-attendance": attendance,
    "@/lib/server/work-permit-presence": presence,
    "@/lib/work-permit-presence": workers,
    "@/lib/server/work-permit-document-store": { syncPermitDocument: async () => {} },
  };
  const js = ts.transpileModule(readFileSync("app/api/work-permits/[id]/sessions/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { POST: (request: Request, props: unknown) => Promise<Response> } };
  new Function("require", "module", "exports", js)((name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return { writes: () => writes, locks, send: () => loaded.exports.POST(new Request("http://localhost/api/work-permits/p1/sessions", {
    method: "POST", body: JSON.stringify({ action, version: 1, sessionId: "s1" }),
  }), { params: Promise.resolve({ id: "p1" }) }) };
}

for (const action of ["open", "handoff"] as const) test(`${action} chặn nhân viên ở phiếu khác trước mọi ghi dữ liệu`, async () => {
  const f = lifecycleFixture(action);
  assert.equal((await f.send()).status, 409);
  assert.equal(f.writes(), 0);
  assert.match(f.locks[0], /pg_advisory_xact_lock/);
});

test("bàn giao giữ người đã RA ở ngoài dù họ đang làm ở phiếu khác", async () => {
  const f = lifecycleFixture("handoff", [outside]);
  assert.equal((await f.send()).status, 200);
  assert.equal(f.writes(), 4);
});
