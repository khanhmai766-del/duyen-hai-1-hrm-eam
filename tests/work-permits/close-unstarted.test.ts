import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as permits from "../../lib/work-permits";
import * as server from "../../lib/server/work-permits";
import * as policy from "../../lib/work-permit-permissions";

type Session = { endedAt: Date | null };
function harness(options: { status?: string; kind?: string; sessions?: Session[]; allowed?: boolean; authorized?: boolean } = {}) {
  const sessions = options.sessions ?? [];
  const before = {
    id: "unstarted", version: 1, kind: options.kind ?? "MECHANICAL", year: 2026, number: "4635", unit: "S2",
    teamType: "CONTRACTOR", contractorScope: "SCTX", format: "PAPER", position: "FGD",
    status: options.status ?? "ISSUED", content: "Sửa chữa bơm hấp thụ số 2", workDate: "2026-10-09",
    teamName: "Nhà thầu kiểm tra", commanderName: "", members: [], workerCount: null,
    issuerName: "Người cấp", issuedAt: new Date("2026-10-09T09:19:00Z"),
    plannedStartAt: new Date("2026-10-09T00:30:00Z"), plannedEndAt: new Date("2026-11-10T10:00:00Z"),
    authorizerName: options.authorized ? "Người cho phép" : "",
    authorizedAt: options.authorized ? new Date("2026-10-10T01:00:00Z") : null,
    closedAt: null, result: "", statusReason: "", progress: null,
  };
  const events: string[] = [];
  const history: Array<{ action: string; before: unknown; after: unknown }> = [];
  let saved: Record<string, any> | null = null;
  const tx = {
    $queryRaw: async () => { events.push("lock"); return []; },
    workPermit: {
      findUnique: async () => before,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("update");
        saved = { ...before, ...data, version: before.version + 1 };
        return saved;
      },
    },
    workPermitSession: { findFirst: async ({ where }: { where: { endedAt?: null } }) => {
      assert.equal(events[0], "lock");
      events.push("read-session");
      return Object.hasOwn(where, "endedAt") ? sessions.find(s => !s.endedAt) ?? null : sessions[0] ?? null;
    } },
    workPermitHistory: { create: async ({ data }: { data: typeof history[number] }) => { history.push(data); } },
  };
  const fail = (error: string, status = 400) => Response.json({ data: null, error }, { status });
  const imports: Record<string, unknown> = {
    "@/lib/api": { requireUser: async () => ({ id: "operator", name: "Người vận hành" }), fail,
      ok: (data: unknown) => Response.json({ data, error: null }), audit: async () => { events.push("audit"); } },
    "@/lib/prisma": { prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } },
    "@/lib/server/work-permit-scope": { requirePermitVisible: async () => {} },
    "@/lib/server/work-permit-permissions": { requirePermitActor: async () => { if (options.allowed === false) throw fail("Không có quyền thao tác", 403); } },
    "@/lib/server/work-permits": server,
    "@/lib/work-permits": permits,
    "@/lib/work-permit-permissions": policy,
    "next/server": { after: () => {} },
    "@/lib/server/overhaul-sheet-writer": { enqueueOverhaulClose: async () => {}, pushOverhaulSheetOutboxQuietly: async () => {} },
  };
  const js = ts.transpileModule(readFileSync("app/api/work-permits/[id]/execution/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { POST: (req: Request, props: unknown) => Promise<Response> } };
  new Function("require", "module", "exports", js)((name: string) => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return { before, events, history, saved: () => saved, close: (patch: Record<string, unknown> = {}) => loaded.exports.POST(
    new Request("http://localhost/api/work-permits/unstarted/execution", { method: "POST", body: JSON.stringify({
      version: 1, status: "CLOSED", closedAt: "2026-11-11T08:00:00+07:00", ...patch,
    }) }), { params: Promise.resolve({ id: before.id }) }),
  };
}

test("kết thúc PCT SCTX Cơ/Điện đã quá hạn, chưa có lần làm việc và chưa khai CHTT", async () => {
  for (const kind of ["MECHANICAL", "ELECTRICAL"]) {
    const h = harness({ kind });
    assert.equal(permits.permitDeadline(h.before, new Date("2026-11-11T01:00:00Z"))?.state, "overdue");
    const response = await h.close();
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.status, "CLOSED");
    assert.equal(data.version, 2);
    assert.equal(data.authorizerName, "");
    assert.equal(data.authorizedAt, null);
    assert.equal(data.commanderName, "");
    assert.equal(data.result, "Kết thúc phiếu — chưa mở lần làm việc");
    assert.equal(h.history[0].action, "Kết thúc phiếu chưa mở lần làm việc");
    assert.deepEqual(h.events, ["lock", "read-session", "read-session", "update", "audit"]);
  }
});

test("kết thúc phiếu chưa làm việc vẫn kiểm tra thời điểm đóng và phiên bản", async () => {
  for (const [patch, status] of [
    [{ closedAt: "2026-10-09T09:18:00Z" }, 400],
    [{ closedAt: null }, 400],
    [{ version: 0 }, 409],
  ] as const) {
    const h = harness();
    assert.equal((await h.close(patch)).status, status);
    assert.equal(h.saved(), null);
    assert.equal(h.history.length, 0);
  }
});

test("không giả lập người/giờ cho phép hoặc nhận thay đổi thông tin cấp phiếu khi đóng", async () => {
  for (const [patch, status] of [
    [{ authorizerName: "Giả lập", authorizedAt: "2026-10-10T01:00:00Z" }, 409],
    [{ content: "Nội dung khác" }, 403],
    [{ allowUnstartedClose: true }, 403],
  ] as const) {
    const h = harness();
    assert.equal((await h.close(patch)).status, status);
    assert.equal(h.saved(), null);
  }
});

test("từ chối đóng phiếu đang làm việc, chưa kết thúc lượt cuối hoặc trạng thái không hợp lệ", async () => {
  for (const options of [
    { status: "ACTIVE", sessions: [{ endedAt: null }] },
    { status: "WAITING", sessions: [{ endedAt: null }], authorized: true },
    { status: "WAITING", sessions: [] },
    { status: "ISSUED", sessions: [{ endedAt: new Date("2026-11-10T10:00:00Z") }], authorized: true },
    { status: "CLOSED" }, { status: "CANCELLED" }, { status: "DRAFT" },
  ]) {
    const h = harness(options);
    assert.equal((await h.close()).status, 409);
    assert.equal(h.saved(), null);
  }
});

test("Chờ làm tiếp vẫn đóng bình thường và không được đóng trước khi kết thúc lượt cuối", async () => {
  const options = { status: "WAITING", authorized: true, sessions: [{ endedAt: new Date("2026-11-10T10:00:00Z") }] };
  const h = harness(options);
  assert.equal((await h.close()).status, 200);
  assert.equal(h.saved()?.result, "Kết thúc phiếu");
  assert.equal(h.saved()?.authorizerName, "Người cho phép");
  const early = harness(options);
  assert.equal((await early.close({ closedAt: "2026-11-10T09:59:00Z" })).status, 409);
  assert.equal(early.saved(), null);
});

test("quyền thao tác vẫn bắt buộc khi kết thúc phiếu chưa làm việc", async () => {
  const h = harness({ allowed: false });
  assert.equal((await h.close()).status, 403);
  assert.deepEqual(h.events, []);
});

test("parsePermit chỉ miễn thông tin cho phép trong nhánh đóng chưa làm việc được server xác minh", () => {
  const { before } = harness();
  const body = JSON.parse(JSON.stringify({ ...before, closedAt: "2026-11-11T01:00:00Z", result: "Kết thúc phiếu" }));
  assert.throws(() => server.parsePermit(body, "CLOSED"), e => e instanceof Response && e.status === 400);
  for (const status of ["ACTIVE", "WAITING", "PAUSED"] as const) {
    assert.throws(() => server.parsePermit({ ...body, closedAt: null }, status, { allowUnstartedClose: true }), e => e instanceof Response && e.status === 400);
  }
});
