import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { usageUndoError } from "../../lib/material-ticket-undo-usage";

const base = {
  id: "vt-10", type: "DE_XUAT", status: "CHO_NGHIEM_THU", usedAt: new Date("2026-10-16T02:00:00Z"),
  updatedAt: new Date("2026-10-16T02:00:00Z"), usedQuantity: 7, remainingQuantity: 3, completedAt: null, settledAt: null,
  docUrl: null, bbktDocUrl: null, recoveryDocUrl: null, recoveryDocNo: null, bbntDoNumber: null,
  recoveryDocSentAt: null, recoveryDocSignedAt: null, unit: "S1",
  materialUserName: "VHV", recoveryRequired: true, usagePhotoBeforeKey: "before.jpg",
  receivedQuantity: 10, items: [{ material: { code: "OIL", unit: "lít" } }],
};

function harness(options: { role?: string; ticket?: object; allocated?: number; claim?: number; auditFails?: boolean } = {}) {
  let ticket = { ...base, ...options.ticket };
  let lots = [{ lotId: "old", quantity: 2 }, { lotId: "new", quantity: options.allocated ?? 5 }];
  let restored = 0;
  let synced = 0;
  const logs: { detail: string }[] = [];
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const tx = {
    materialTicket: {
      updateMany: async () => ({ count: options.claim ?? 1 }),
      findUniqueOrThrow: async () => ticket,
      update: async ({ data }: { data: object }) => (ticket = { ...ticket, ...data }),
    },
    materialLotUsage: { findMany: async () => lots },
    auditLog: { create: async ({ data }: { data: { detail: string } }) => {
      if (options.auditFails) throw new Error("audit unavailable");
      logs.push(data);
    } },
  };
  const modules: Record<string, unknown> = {
    "@/lib/prisma": { prisma: { $transaction: async (fn: (arg: typeof tx) => Promise<unknown>) => {
      const saved = structuredClone({ ticket, lots, restored, synced });
      try { return await fn(tx); } catch (e) {
        ({ ticket, lots, restored, synced } = saved);
        throw e;
      }
    } } },
    "@/lib/api": { requireUser: async () => ({ id: "admin", role: options.role ?? "ADMIN" }), fail,
      ok: (data: unknown) => Response.json({ data }),
      handle: async (fn: () => Promise<Response>) => { try { return await fn(); } catch (e) { return e instanceof Response ? e : fail("Lỗi máy chủ", 500); } },
    },
    "@/lib/material-ticket-bbnt-do": { getTicket: async () => ticket, ITEM_INCLUDE: {} },
    "@/lib/material-ticket-undo-usage": { usageUndoError },
    "@/lib/material-ticket-sequence": { materialTicketReference: () => "VT-10 tháng 8/2026" },
    "@/lib/material-stock-lot": {
      releaseUsage: async () => { restored += lots.reduce((s, r) => s + r.quantity, 0); lots = []; },
      syncMaterialQuantity: async () => { synced++; }, sharedCodesOf: () => ["OIL"],
    },
    "@/lib/constants": { isGasCylinderCategory: () => false },
  };
  const source = ts.transpileModule(readFileSync("app/api/material-tickets/[id]/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { PUT: (req: unknown, ctx: unknown) => Promise<Response> } };
  new Function("require", "module", "exports", source)((name: string) => modules[name] ?? {}, loaded, loaded.exports);
  return {
    call: (body = {}) => loaded.exports.PUT({ json: async () => ({ action: "undoUsage", reason: "Nhập nhầm phiếu", usedAt: base.usedAt.toISOString(), ...body }) }, { params: Promise.resolve({ id: base.id }) }),
    state: () => ({ ticket, lots, restored, synced, logs }),
  };
}

test("Hoàn đúng tổng phân bổ, gỡ dữ liệu/ảnh và lưu dấu vết; giữ lượng lãnh và cấu hình thu hồi", async () => {
  const h = harness();
  assert.equal((await h.call()).status, 200);
  const s = h.state();
  assert.equal(s.restored, 7);
  assert.equal(s.synced, 1);
  assert.deepEqual(s.lots, []);
  assert.equal(s.ticket.status, "SU_DUNG_VAT_TU");
  assert.equal(s.ticket.usedQuantity, null);
  assert.equal(s.ticket.usedAt, null);
  assert.equal(s.ticket.usagePhotoBeforeKey, null);
  assert.equal(s.ticket.receivedQuantity, 10);
  assert.equal(s.ticket.remainingQuantity, 10);
  assert.equal(s.ticket.recoveryRequired, true);
  assert.match(s.logs[0].detail, /Nhập nhầm phiếu/);
  assert.match(s.logs[0].detail, /before.jpg/);
  assert.equal((await h.call()).status, 409);
  assert.equal(h.state().restored, 7);
});

for (const role of ["MANAGER", "SUPERVISOR", "TECHNICIAN", "VIEWER"]) {
  test(`Từ chối vai trò ${role}`, async () => {
    const h = harness({ role });
    assert.equal((await h.call()).status, 403);
    assert.equal(h.state().restored, 0);
  });
}
for (const reason of [" ", "a".repeat(1001)]) {
  test(`Từ chối lý do không hợp lệ (${reason.length} ký tự)`, async () => {
    const h = harness();
    assert.equal((await h.call({ reason })).status, 400);
    assert.equal(h.state().restored, 0);
  });
}
for (const patch of [
  { completedAt: new Date() }, { settledAt: new Date() }, { docUrl: "bbnt" }, { bbktDocUrl: "bbnt" },
  { recoveryDocUrl: "bbthvt" }, { recoveryDocNo: 1 }, { recoveryDocSignedAt: new Date() },
  { recoveryDocSentAt: new Date() }, { bbntDoNumber: "123" }, { status: "HOAN_TAT" }, { type: "HOA_CHAT" },
]) {
  test(`Chặn hồ sơ không đủ điều kiện ${Object.keys(patch)[0]}`, async () => {
    const h = harness({ ticket: patch });
    assert.equal((await h.call()).status, 409);
    assert.equal(h.state().restored, 0);
  });
}
test("Cho hủy cả phiếu bị trả ảnh", async () => {
  const h = harness({ ticket: { status: "SU_DUNG_VAT_TU", usagePhotoReviewStatus: "REJECTED" } });
  assert.equal((await h.call()).status, 200);
});
test("Chặn bản ghi cũ và xung đột đồng thời trước khi hoàn kho", async () => {
  const stale = harness();
  assert.equal((await stale.call({ usedAt: "2026-10-15T02:00:00Z" })).status, 409);
  const raced = harness({ claim: 0 });
  assert.equal((await raced.call()).status, 409);
  assert.equal(raced.state().restored, 0);
});
test("Không hoàn nếu phân bổ lô thiếu", async () => {
  const h = harness({ allocated: 1 });
  assert.equal((await h.call()).status, 409);
  assert.equal(h.state().restored, 0);
});
test("Lỗi ghi nhật ký phải hoàn tác cả kho lẫn trạng thái", async () => {
  const h = harness({ auditFails: true });
  assert.equal((await h.call()).status, 500);
  assert.equal(h.state().restored, 0);
  assert.equal(h.state().ticket.usedQuantity, 7);
});

for (const type of ["UNG", "SU_DUNG_HIEN_CO"]) {
  test(`Hủy đúng luồng ${type}, giữ thông tin lãnh`, async () => {
    const h = harness({ ticket: { type } });
    assert.equal((await h.call()).status, 200);
    assert.equal(h.state().ticket.receivedQuantity, 10);
    assert.equal(h.state().restored, 7);
  });
}
test("Không cho hủy phiếu chưa ghi nhận sử dụng", async () => {
  const h = harness({ ticket: { usedAt: null, usedQuantity: null, status: "SU_DUNG_VAT_TU" } });
  assert.equal((await h.call()).status, 409);
  assert.equal(h.state().restored, 0);
});
