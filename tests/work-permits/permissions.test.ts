import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as policy from "../../lib/work-permit-permissions";
import * as permits from "../../lib/work-permits";

// Load actual route/guard code with DB/session boundaries replaced by in-memory fakes.
function load(file: string, imports: Record<string, unknown>) {
  const js = ts.transpileModule(readFileSync(resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", js)((name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
function harness(canIssue: boolean, canExecute: boolean) {
  const user = { id: "operator", role: "TECHNICIAN", name: "Người vận hành" };
  const fail = (message: string, status = 400) => Response.json({ data: null, error: message }, { status });
  const granted = (id: string) => id === policy.PERMIT_ISSUE_PERMISSION ? canIssue : id === policy.PERMIT_EXECUTE_PERMISSION ? canExecute : false;
  const permissions = load("lib/server/work-permit-permissions.ts", {
    "@/lib/work-permit-permissions": policy,
    "@/lib/rbac-guard": {
      hasPermissionLevel: async (_user: unknown, id: string) => granted(id),
      requirePermissionLevel: async (_user: unknown, id: string, _levels: unknown, message: string) => { if (!granted(id)) throw fail(message, 403); },
    },
  });
  let writes = 0;
  const before = { id: "permit-1", version: 3, status: "ACTIVE", teamType: "INTERNAL", kind: "MECHANICAL", year: 2026, number: "1", content: "Công việc đã cấp", authorizerName: "Người cho phép", authorizedAt: new Date("2026-09-11T01:00:00Z"), closedAt: null, result: "", statusReason: "", progress: 20 };
  const api = { requireUser: async () => user, fail, ok: (data: unknown) => Response.json({ data, error: null }), audit: async () => {} };
  const tx = { $queryRaw: async () => [], workPermit: { findUnique: async () => before, update: async ({ data }: any) => { writes++; return { ...before, ...data }; } }, workPermitHistory: { create: async () => {} } };
  const server = {
    permitBody: (r: Request) => r.json(),
    permitHandle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (e) { if (e instanceof Response) return e; throw e; } },
    permitSnapshot: (value: unknown) => JSON.parse(JSON.stringify(value)),
    parsePermit: (value: any) => ({ ...value, authorizedAt: value.authorizedAt ? new Date(value.authorizedAt) : null, closedAt: value.closedAt ? new Date(value.closedAt) : null, searchText: "" }),
  };
  const imports = { "@/lib/api": api, "@/lib/server/work-permit-permissions": permissions, "@/lib/work-permit-permissions": policy, "@/lib/work-permits": permits, "@/lib/server/work-permits": server, "@/lib/prisma": { prisma: { $transaction: (fn: any) => fn(tx) } }, "@/lib/server/work-permit-safety": {}, "@/lib/server/work-permit-identities": {}, "@/lib/server/work-permit-selects": {}, "@/lib/nav": {}, "@/lib/server/work-permit-sessions": {} };
  return { permissions, before, writes: () => writes, route: (file: string) => load(file, imports) };
}
const request = (body: unknown) => new Request("http://localhost/api/work-permits/permit-1/execution", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const context = { params: { id: "permit-1" } };

test("a technician can receive either workflow permission independently", async () => {
  assert.deepEqual(await harness(true, false).permissions.permitCapabilities({ id: "operator", role: "TECHNICIAN" }), { canIssue: true, canExecute: false });
  assert.deepEqual(await harness(false, true).permissions.permitCapabilities({ id: "operator", role: "TECHNICIAN" }), { canIssue: false, canExecute: true });
});
test("issue-only cannot execute or open/end/handoff a session", async () => {
  const h = harness(true, false);
  assert.equal((await h.route("app/api/work-permits/[id]/execution/route.ts").POST(request({ version: 3, progress: 50 }), context)).status, 403);
  for (const action of ["open", "end", "handoff"]) assert.equal((await h.route("app/api/work-permits/[id]/sessions/route.ts").POST(request({ action }), context)).status, 403);
  assert.equal((await h.route("app/api/work-permits/[id]/route.ts").PUT(request({ version: 3, status: "ACTIVE", progress: 90 }), context)).status, 403);
  assert.equal(h.writes(), 0);
});
test("execute-only cannot create or edit the issued content through existing routes", async () => {
  const h = harness(false, true);
  assert.equal((await h.route("app/api/work-permits/route.ts").POST(request({ status: "ISSUED" }))).status, 403);
  assert.equal((await h.route("app/api/work-permits/[id]/route.ts").PUT(request({ version: 3, content: "Thay nội dung" }), context)).status, 403);
  assert.equal(h.writes(), 0);
});
test("execute-only updates progress, but rejects injected issue fields and cancellation", async () => {
  const h = harness(false, true), route = h.route("app/api/work-permits/[id]/execution/route.ts");
  const good = await route.POST(request({ version: 3, progress: 65 }), context);
  assert.equal(good.status, 200); assert.equal((await good.json()).data.progress, 65);
  assert.equal((await route.POST(request({ version: 3, progress: 70, content: "Nội dung khác" }), context)).status, 403);
  assert.equal((await route.POST(request({ version: 3, status: "CANCELLED" }), context)).status, 409);
  assert.equal(h.writes(), 1);
});
test("execution validates versions and progress before writing", async () => {
  const h = harness(false, true), route = h.route("app/api/work-permits/[id]/execution/route.ts");
  for (const progress of [-1, 101, 1.5, "50", null]) assert.equal((await route.POST(request({ version: 3, progress }), context)).status, 400);
  assert.equal((await route.POST(request({ version: 2, progress: 50 }), context)).status, 409);
  assert.equal(h.writes(), 0);
});
test("permission checks distinguish issue fields from execution changes and normalize timestamps", () => {
  const before = harness(false, false).before;
  assert.equal(policy.permitIssueUpdateNeedsExecution(before, { content: "Sửa nội dung" }), false);
  assert.equal(policy.permitIssueUpdateNeedsExecution(before, { authorizedAt: "2026-09-11T08:00:00+07:00" }), false);
  for (const body of [{ authorizedAt: null }, { authorizerName: "Khác" }, { result: "Xong" }, { progress: 90 }, { status: "CLOSED" }]) assert.equal(policy.permitIssueUpdateNeedsExecution(before, body), true);
  assert.equal(policy.permitIssueUpdateNeedsExecution(before, { status: "CANCELLED" }), false);
});
