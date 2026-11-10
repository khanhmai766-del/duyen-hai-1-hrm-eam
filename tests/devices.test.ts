import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import * as units from "../lib/equipment-units";
import * as tree from "../lib/equipment-tree";
import * as device from "../lib/equipment-device";
import * as qr from "../lib/device-qr";
import { invalidateEquipmentQueries } from "../lib/equipment-query-cache";

const require = createRequire(import.meta.url);
function load(file: string, imports: Record<string, unknown>): any {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => {
    if (name in imports) return imports[name];
    assert.ok(!name.startsWith("@/"), `Thiếu mock ${name}`);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}

const parent = "DH1.S1.1", seq = `${parent}.1`, child = `${seq}.1`;
type Row = Record<string, any>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((condition: Row) => matches(row, condition));
    if (key === "NOT") return !matches(row, value);
    if (key === "nodeSeq_machine") return matches(row, value);
    if (value && typeof value === "object") {
      if (value.in) return value.in.includes(row[key]);
      if (value.startsWith) return row[key]?.startsWith(value.startsWith);
    }
    return (row[key] ?? null) === value;
  });
}

function fixture() {
  let tables: Record<string, Row[]> = {
    equipmentNode: [
      { id: "root", seq: parent, code: parent, parentSeq: null, name: "Gốc", depth: 3, sort: 1, childCount: 1 },
      { id: "pump", seq, code: seq, parentSeq: parent, name: "Bơm S1", kks: "10PUMP", imageUrl: "s1-photo", attachedInfo: "Thông tin S1", documentUrl: null, depth: 4, sort: 2, childCount: 1 },
      { id: "valve", seq: child, code: child, parentSeq: seq, name: "Van", kks: null, depth: 5, sort: 3, childCount: 0 },
    ],
    equipmentProfile: [{ id: "p2", nodeSeq: seq, machine: "S2", name: "Bơm S2", kks: "20PUMP", imageUrl: null, attachedInfo: null, documentUrl: null }],
    repairLog: [{ deviceSeq: seq, machine: "S1", startedAt: new Date("2026-10-01") }, { deviceSeq: seq, machine: "S2", startedAt: new Date("2026-10-02") }, { deviceSeq: seq, machine: "S2", startedAt: new Date("2026-10-03") }],
    deviceQrCard: [{ id: "qr1", deviceSeq: seq, machine: "S1" }, { id: "qr2", deviceSeq: seq, machine: "S2" }],
    positionSystemScope: [{ systemSeq: seq }], materialReplacement: [{ system: child, deviceSeq: null }],
    materialReplacementLog: [{ deviceSeq: child }], materialTicketItem: [{ deviceSeq: seq, replacementPointKeys: [seq, child] }],
  };
  const denied = new Set<string>(), invalidated: string[] = [];
  let failTable = "", locks = 0;
  const db: any = {};
  const foreignKeys: Record<string, string> = { repairLog: "deviceSeq", equipmentMaterial: "deviceSeq", materialReplacement: "deviceSeq", defect: "deviceSeq", defectHistory: "deviceSeq", defectRelatedDevice: "deviceSeq", defectHistoryRelatedDevice: "deviceSeq", equipmentProfile: "nodeSeq", deviceQrCard: "deviceSeq", materialTicketItem: "deviceSeq" };
  for (const table of [...new Set(["equipmentNode", "equipmentProfile", "positionSystemScope", "materialReplacementLog", "pcccExtinguisher", "pcccCabinet", "pcccBulk", ...Object.keys(foreignKeys)])]) {
    tables[table] ??= [];
    const rows = () => tables[table];
    db[table] = {
      findMany: async ({ where }: Row = {}) => structuredClone(rows().filter(row => matches(row, where))),
      findUnique: async ({ where }: Row) => structuredClone(rows().find(row => matches(row, where)) ?? null),
      findUniqueOrThrow: async ({ where }: Row) => { const row = rows().find(row => matches(row, where)); assert.ok(row); return structuredClone(row); },
      findFirst: async ({ where }: Row) => structuredClone(rows().find(row => matches(row, where)) ?? null),
      count: async ({ where }: Row) => rows().filter(row => matches(row, where)).length,
      aggregate: async () => ({ _max: { sort: Math.max(...rows().map(row => row.sort)) } }),
      update: async ({ where, data }: Row) => {
        const row = rows().find(row => matches(row, where)); assert.ok(row);
        const oldSeq = row.seq;
        Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
        if (table === "equipmentNode" && row.seq !== oldSeq) for (const [name, field] of Object.entries(foreignKeys)) {
          for (const linked of tables[name]) if (linked[field] === oldSeq) linked[field] = row.seq;
        }
        return row;
      },
      updateMany: async ({ where, data }: Row) => {
        if (failTable === table) throw new Error("Lỗi ghi giả lập");
        const selected = rows().filter(row => matches(row, where));
        selected.forEach(row => Object.assign(row, data)); return { count: selected.length };
      },
      deleteMany: async ({ where }: Row) => { const before = rows().length; tables[table] = rows().filter(row => !matches(row, where)); return { count: before - rows().length }; },
      upsert: async ({ where, create, update }: Row) => {
        const row = rows().find(row => matches(row, where));
        if (row) { Object.assign(row, update); return row; }
        const created = { id: `new-${rows().length}`, name: null, kks: null, imageUrl: null, attachedInfo: null, documentUrl: null, ...create };
        rows().push(created); return created;
      },
    };
  }
  db.repairLog.groupBy = async ({ by }: Row) => {
    const groups = new Map<string, Row>();
    for (const row of tables.repairLog) {
      const key = JSON.stringify(by.map((key: string) => row[key]));
      const group = groups.get(key) ?? { ...Object.fromEntries(by.map((key: string) => [key, row[key]])), _count: { _all: 0 }, _max: { startedAt: row.startedAt } };
      group._count._all++; if (row.startedAt > group._max.startedAt) group._max.startedAt = row.startedAt;
      groups.set(key, group);
    }
    return [...groups.values()];
  };
  db.$executeRaw = async () => { locks++; };
  db.$executeRawUnsafe = async (_sql: string, oldSeq: string, nextSeq: string) => {
    for (const row of tables.materialTicketItem) row.replacementPointKeys = row.replacementPointKeys.map((key: string) => key === oldSeq ? nextSeq : key);
  };
  db.$transaction = async (run: (tx: any) => Promise<unknown>) => {
    const snapshot = structuredClone(tables);
    try { return await run(db); } catch (error) { tables = snapshot; throw error; }
  };
  const api = {
    requireUser: async () => ({ id: "admin", role: "ADMIN" }),
    handle: async (run: () => Promise<Response>) => { try { return await run(); } catch (error) { return error instanceof Response ? error : Response.json({ error: "Lỗi ghi giả lập" }, { status: 500 }); } },
    ok: (data: unknown) => Response.json({ data, error: null }), fail: (error: string, status = 400) => Response.json({ error }, { status }), audit: async () => {},
  };
  const assertEditable = async (_user: unknown, code: string) => { if (denied.has(code)) throw api.fail("Không đủ quyền", 403); };
  const imports: Record<string, unknown> = {
    "@/lib/prisma": { prisma: db }, "@/lib/api": api, "@/lib/equipment-units": units, "@/lib/equipment-tree": tree, "@/lib/equipment-device": device, "@/lib/device-qr": qr,
    "@/lib/nav": { normalizeText: (text: string) => text }, "@/lib/equipment-import": { displayCode: (code: string) => code },
    "@/lib/equipment-child-count": load("lib/equipment-child-count.ts", {}),
    "@/lib/server-access": { assertSeqEditable: assertEditable, assertSeqViewable: async () => {}, assertSeqsEditable: async (user: unknown, codes: string[]) => { for (const code of codes) await assertEditable(user, code); }, managingPositionsForEquipmentSeq: async () => [], resolveEquipmentAccessForUser: async () => ({}), filterEquipmentNodesForUser: async (_user: unknown, nodes: unknown[]) => nodes, invalidateEquipmentAccessCache: () => invalidated.push("access") },
    "@/lib/equipment-node-cache": { getCachedEquipmentNodeList: async () => tables.equipmentNode, getEquipmentTreeIndexFor: tree.buildEquipmentTreeIndex, invalidateEquipmentNodeCache: () => invalidated.push("nodes") },
    "@/lib/s3": { maybeUploadDataUrl: async ({ value }: Row) => value }, "@/lib/device-list-cache": { invalidateDeviceListCache: () => invalidated.push("list") },
    "@/lib/equipment-profile-cache": { invalidateEquipmentProfileCache: () => invalidated.push("profiles") }, "@/lib/position-scope-cache": { invalidatePositionScopeCache: () => invalidated.push("scopes") },
    "@/lib/rbac-guard": { hasPermissionLevel: async () => true }, "@/lib/device-permissions": { requireDeviceView: async () => {}, requireDeviceManage: async () => {} },
    "@/lib/repair-machine": { ensureRepairMachineColumn: async () => {} }, "@/lib/device-qr-card-table": { ensureDeviceQrCardTable: async () => {} },
    "@/lib/position-data-scope": { resolvePositionViewScope: async () => ({}) }, "@/lib/material-replacement-access": { canViewMaterialReplacement: () => true }, "@/lib/defect-active-where": { outstandingDefectWhere: () => ({}) },
  };
  const move = load("lib/equipment-move.ts", imports); imports["@/lib/equipment-move"] = move;
  const route = load("app/api/devices/[id]/route.ts", imports);
  return { get tables() { return tables; }, denied, invalidated, move, db, imports, get locks() { return locks; }, fail: (table: string) => { failTable = table; },
    put: (body: Row) => route.PUT(new NextRequest(`http://localhost/api/devices/${seq}`, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: seq }) }) };
}

test("mã đầy đủ sắp số tự nhiên; nhánh .1 không nhận nhầm .10", () => {
  assert.deepEqual([`${parent}.10`, seq, `${parent}.2`].sort(tree.compareEquipmentSeq), [seq, `${parent}.2`, `${parent}.10`]);
  assert.equal(tree.compareEquipmentSeq(seq, seq), 0);
});

test("lưu S2 không thay tên/KKS/ảnh S1; xóa ảnh kế thừa S1 vẫn giữ được trạng thái xóa", async () => {
  const f = fixture(), base = structuredClone(f.tables.equipmentNode);
  const response = await f.put({ code: seq, machine: "S2", name: "Bơm S2 mới", kks: "20NEW", images: [], attachedInfo: "Riêng S2", documentUrl: "" });
  assert.equal(response.status, 200);
  assert.deepEqual(f.tables.equipmentNode, base);
  assert.equal((await response.json()).data.name, "Bơm S2 mới");
  assert.equal(f.tables.equipmentProfile[0].attachedInfo, "Riêng S2");
  const clear = await f.put({ machine: "S1", images: [], attachedInfo: "", documentUrl: "" });
  assert.equal(clear.status, 200);
  assert.deepEqual((await clear.json()).data.images, []);
  assert.equal(f.tables.equipmentNode[1].imageUrl, "s1-photo");
  assert.equal(f.tables.equipmentProfile.find(row => row.machine === "S1")?.imageUrl, "");
});

test("đổi mã cập nhật con, lịch sử, hồ sơ, QR, phân quyền và liên kết văn bản trong giao dịch", async () => {
  const f = fixture(), next = `${parent}.2`, nextChild = `${next}.1`;
  assert.equal((await f.put({ code: next, machine: "S2" })).status, 200);
  assert.equal(f.locks, 1);
  assert.equal(f.tables.equipmentNode.find(row => row.id === "valve")?.parentSeq, next);
  assert.equal(f.tables.equipmentNode.find(row => row.id === "valve")?.seq, nextChild);
  assert.ok(f.tables.equipmentNode.find(row => row.id === "pump")?.relocated);
  assert.ok(f.tables.repairLog.every(row => row.deviceSeq === next));
  assert.ok(f.tables.equipmentProfile.every(row => row.nodeSeq === next));
  assert.ok(f.tables.deviceQrCard.every(row => row.deviceSeq === next));
  assert.deepEqual(f.tables.deviceQrCard.map(row => row.machine), ["S1", "S2"]);
  assert.equal(f.tables.positionSystemScope[0].systemSeq, next);
  assert.equal(f.tables.materialReplacement[0].system, nextChild);
  assert.equal(f.tables.materialReplacementLog[0].deviceSeq, nextChild);
  assert.deepEqual(f.tables.materialTicketItem[0].replacementPointKeys, [next, nextChild]);
  assert.ok(f.invalidated.includes("scopes"));
});

test("lỗi giữa giao dịch trả lại cả mã và liên kết cũ; chặn thư mục đích/nhánh con không có quyền", async () => {
  for (const blocked of ["write", parent, child]) {
    const f = fixture(), before = structuredClone(f.tables);
    if (blocked === "write") f.fail("materialReplacementLog"); else f.denied.add(blocked);
    assert.equal((await f.put({ code: `${parent}.2` })).status, blocked === "write" ? 500 : 403);
    assert.deepEqual(f.tables, before);
  }
});

test("chặn mã trùng, tự làm cha và đổi phạm vi; mã .10 không chặn mã .1", async () => {
  const f = fixture();
  f.tables.equipmentNode.push({ id: "ten", seq: `${parent}.10`, parentSeq: parent, depth: 4, name: "Mười", sort: 10 });
  assert.equal((await f.move.planEquipmentMove(f.db, { sourceSeq: seq, targetParentSeq: parent, targetSeq: `${parent}.10` })).ok, false);
  assert.equal((await f.move.planEquipmentMove(f.db, { sourceSeq: seq, targetParentSeq: seq, targetSeq: child })).ok, false);
  assert.equal((await f.move.planEquipmentMove(f.db, { sourceSeq: seq, targetParentSeq: parent, targetSeq: seq })).ok, true);
  f.tables.equipmentNode.push({ seq: "DH1.S1.5", name: "Chung", parentSeq: null, depth: 3, sort: 11 });
  assert.equal((await f.move.planEquipmentMove(f.db, { sourceSeq: seq, targetParentSeq: "DH1.S1.5", targetSeq: "DH1.S1.5.2" })).ok, false);
});

test("thẻ QR đọc cùng hồ sơ với lý lịch và đếm riêng S1/S2", async () => {
  const f = fixture(), cards = load("app/api/device-qr-cards/route.ts", f.imports);
  const response = await cards.GET(), rows = (await response.json()).data;
  assert.deepEqual(rows.map((row: Row) => row._count.repairLogs), [1, 2]);
  assert.equal(rows[1].name, "Bơm S2"); assert.equal(rows[1].kks, "20PUMP");
  assert.deepEqual(rows[0].images, ["s1-photo"]); assert.deepEqual(rows[1].images, []);
  assert.ok(qr.deviceDetailUrl(seq, "S2").includes("machine=S2"));
});

test("thay đổi thiết bị làm mới cây, lý lịch và QR; đổi cấu trúc làm mới thêm nghiệp vụ", async () => {
  const qc = new QueryClient();
  const keys = [["equipment-tree", "roots"], ["equipment-node", seq, "S2"], ["device", seq, "S2", 2], ["device-qr-cards"], ["repair-history"], ["position-system-scopes"]];
  keys.forEach(key => qc.setQueryData(key, {}));
  await invalidateEquipmentQueries(qc);
  assert.ok(keys.slice(0, 4).every(key => qc.getQueryState(key)?.isInvalidated));
  assert.equal(qc.getQueryState(keys[4])?.isInvalidated, false);
  await invalidateEquipmentQueries(qc, true);
  assert.ok(keys.every(key => qc.getQueryState(key)?.isInvalidated));
  qc.clear();
});

test("đổi mã không gọi lại lý lịch mã cũ, vẫn làm mới lý lịch khác đang mở", async () => {
  const qc = new QueryClient(), calls = [0, 0];
  const options = [seq, `${parent}.2`].map((id, index) => ({ queryKey: ["device", id, "S2"],
    queryFn: async () => ++calls[index], staleTime: Infinity }));
  await Promise.all(options.map(option => qc.fetchQuery(option)));
  const unsubscribe = options.map(option => new QueryObserver(qc, option).subscribe(() => {}));
  await invalidateEquipmentQueries(qc, true, seq);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(qc.getQueryState(options[0].queryKey)?.isInvalidated, true);
  unsubscribe.forEach(stop => stop()); qc.clear();
});
