import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { effectivePermitFormat, formatPermitNumber } from "../../lib/work-permits";

type Options = { role?: string; accessMode?: string; status?: string; version?: number; missing?: boolean; openSessions?: number; sharedDocument?: boolean; failDelete?: boolean };
function harness(options: Options = {}) {
  const events: string[] = [], logs: unknown[][] = [], numberHistory: unknown[] = [];
  const row = { id: "test-permit", kind: "MECHANICAL", year: 2026, number: "99", format: "PAPER", teamType: "CONTRACTOR", status: options.status ?? "CANCELLED", version: 3 };
  const fail = (error: string, status = 400) => Response.json({ data: null, meta: null, error }, { status });
  const api = {
    requireUser: async () => ({ id: "admin", name: "Quản trị", role: options.role ?? "ADMIN", accessMode: options.accessMode ?? "NORMAL" }),
    requireRole: (user: { role: string }, roles: string[]) => { if (!roles.includes(user.role)) throw fail("Không đủ quyền truy cập", 403); },
    fail, ok: (data: unknown) => Response.json({ data, meta: null, error: null }),
    audit: async (...args: unknown[]) => { events.push("audit"); logs.push(args); },
  };
  const tx = {
    $queryRaw: async () => { events.push("lock"); return []; },
    workPermit: {
      findUnique: async () => options.missing ? null : row,
      findFirst: async () => options.sharedDocument ? { id: "reissued" } : null,
      delete: async () => { if (options.failDelete) throw new Error("DB error"); events.push("delete-permit"); return row; },
    },
    workPermitSession: { count: async () => options.openSessions ?? 0, deleteMany: async () => { events.push("delete-sessions"); return { count: 2 }; } },
    workPermitHistory: { deleteMany: async () => { events.push("delete-history"); return { count: 4 }; } },
    workPermitNumberReservation: { findMany: async () => [{ id: "reservation" }] },
    workPermitNumberReservationHistory: { create: async (args: unknown) => { numberHistory.push(args); return args; } },
  };
  const prisma = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => { events.push("transaction"); const result = await fn(tx); events.push("commit"); return result; } };
  const imports: Record<string, unknown> = {
    "@/lib/api": api,
    "@/lib/server/work-permit-prisma": { workPermitPrisma: prisma },
    "@/lib/server/work-permit-scope": { requirePermitVisible: async () => {} },
    "@/lib/server/work-permits": {
      permitBody: (req: Request) => req.json(),
      permitText: (body: Record<string, unknown>, key: string, max: number) => { const value = body[key] ?? ""; if (typeof value !== "string" || value.length > max) throw fail("Thông tin không hợp lệ"); return value.trim(); },
      permitHandle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (e) { if (e instanceof Response) return e; throw e; } },
    },
    "@/lib/work-permits": { effectivePermitFormat, formatPermitNumber },
    "@/lib/server/work-permit-document-store": { syncPermitDocument: async () => { events.push("delete-document"); } },
  };
  for (const name of ["work-permit-overhaul", "work-permit-permissions", "work-permit-safety", "work-permit-identities", "work-permit-selects", "work-permit-number-reservations"]) imports[`@/lib/server/${name}`] = {};
  imports["@/lib/work-permit-permissions"] = {};
  const source = ts.transpileModule(readFileSync("app/api/work-permits/[id]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> } };
  new Function("require", "module", "exports", source)((name: string) => { if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`); return imports[name]; }, loaded, loaded.exports);
  const call = (body: unknown = { version: options.version ?? 3, reason: "Dọn phiếu test" }) => loaded.exports.DELETE(new Request("http://localhost/api/work-permits/test-permit", { method: "DELETE", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: row.id }) });
  return { call, events, logs, numberHistory };
}

test("chỉ ADMIN đang ở chế độ quản trị được xóa PCT", async () => {
  for (const role of ["MANAGER", "SUPERVISOR", "TECHNICIAN", "VIEWER"]) {
    const h = harness({ role }); assert.equal((await h.call()).status, 403); assert.deepEqual(h.events, []);
  }
  const h = harness({ accessMode: "DEFECT_READ_ONLY" }); assert.equal((await h.call()).status, 403); assert.deepEqual(h.events, []);
});
test("chỉ xóa trạng thái đã hủy, đúng phiên bản, không còn lần làm việc mở", async () => {
  for (const options of [{ status: "DRAFT" }, { status: "ISSUED" }, { status: "ACTIVE" }, { status: "PAUSED" }, { status: "WAITING" }, { status: "CLOSED" }, { version: 2 }, { openSessions: 1 }]) {
    const h = harness(options); assert.equal((await h.call()).status, 409); assert.ok(!h.events.some(e => e.startsWith("delete"))); assert.equal(h.logs.length, 0);
  }
  const h = harness({ missing: true }); assert.equal((await h.call()).status, 404);
});
test("bắt buộc lý do hợp lệ và phiên bản trước khi xóa", async () => {
  for (const reason of ["", "    ", "test", 123, "x".repeat(2001)]) {
    const h = harness(); assert.equal((await h.call({ version: 3, reason })).status, 400); assert.deepEqual(h.events, []);
  }
  const h = harness(); assert.equal((await h.call({ reason: "Dọn phiếu test" })).status, 409);
});
test("xóa các bản ghi phụ trước phiếu trong transaction, giữ lịch sử cấp số và ghi audit", async () => {
  const h = harness(); const response = await h.call(); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { id: "test-permit" });
  assert.deepEqual(h.events, ["transaction", "lock", "delete-sessions", "delete-history", "delete-permit", "commit", "audit", "delete-document"]);
  assert.deepEqual(h.numberHistory, [{ data: { reservationId: "reservation", action: "PERMIT_DELETED", actorId: "admin", actorName: "Quản trị", permitId: "test-permit", note: "Dọn phiếu test" } }]);
  assert.equal(h.logs[0][1], "DELETE_WORK_PERMIT"); assert.match(String(h.logs[0][4]), /Dọn phiếu test/);
});
test("không xóa file Word đang dùng chung với phiếu cấp lại số", async () => {
  const h = harness({ sharedDocument: true }); assert.equal((await h.call()).status, 200); assert.ok(!h.events.includes("delete-document"));
});
test("transaction thất bại thì không ghi audit thành công hoặc xóa file Word", async () => {
  const h = harness({ failDelete: true }); await assert.rejects(h.call(), /DB error/);
  assert.ok(!h.events.includes("commit")); assert.equal(h.logs.length, 0); assert.ok(!h.events.includes("delete-document"));
});
