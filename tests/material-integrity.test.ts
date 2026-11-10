import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";
import { invalidateMaterialQueries } from "../lib/material-query-cache";

type Row = Record<string, any>;
function load(file: string, imports: Row = {}) {
  const mod = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(name in imports, `Thiếu mock ${name}`); return imports[name];
  }, mod, mod.exports);
  return mod.exports;
}
const fail = (error: string, status = 400) => Response.json({ error }, { status });
const api = { fail, ok: (data: unknown) => Response.json({ data }), requireUser: async () => ({ id: "user", role: "ADMIN", position: "A" }),
  audit: async () => {}, auditDetailWithPosition: () => "", handle: async (fn: () => Promise<Response>) => {
    try { return await fn(); } catch (error) { return error instanceof Response ? error : fail(error instanceof Error ? error.message : "Lỗi máy chủ", 500); }
  } };
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (value === undefined) return true;
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if ("gte" in value) return row[key] >= value.gte;
      if ("gt" in value) return row[key] > value.gt;
      if ("hasSome" in value) return (row[key] ?? []).some((item: string) => value.hasSome.includes(item));
    }
    return row[key] === value;
  });
}
function fixture() {
  let state: Row = { material: [{ id: "m", code: "OLD", erpCodes: ["OLD"], machine: "S1", category: "Dầu bôi trơn", quantity: 0, minStock: 0, name: "Dầu", unit: "Lít", system: null,
    imageUrl: null, documentUrl: "manual.pdf", documentName: "Tài liệu", note: null }], materialReplacement: [], equipmentMaterial: [], materialStockLot: [], materialLotUsage: [],
    materialTicketItem: [], materialStockMovement: [], defectMaterialRequest: [], materialReplacementLog: [], materialTicketReplacement: [] };
  let serial = 0, tail = Promise.resolve(), failure = "";
  const db: Row = {};
  for (const model of Object.keys(state)) {
    const find = ({ where }: Row = {}) => state[model].filter((row: Row) => matches(row, where));
    const project = (row: Row, args: Row) => row ? structuredClone(model === "material" && args?.include ? { ...row,
      replacements: state.materialReplacement.filter((point: Row) => point.materialId === row.id), deviceMaterials: [] } : row) : null;
    const update = (row: Row, data: Row) => { for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      row[key] = value && typeof value === "object" && !(value instanceof Date) && ("increment" in value || "decrement" in value)
        ? row[key] + ((value as Row).increment ?? 0) - ((value as Row).decrement ?? 0) : structuredClone(value);
    } return structuredClone(row); };
    const check = (action: string) => { if (failure === `${model}.${action}`) throw new Error("Giả lập ghi lỗi"); };
    db[model] = {
      findMany: async (args: Row = {}) => find(args).map((row: Row) => project(row, args)),
      findFirst: async (args: Row = {}) => project(find(args)[0], args),
      findUnique: async (args: Row) => project(find(args)[0], args),
      findUniqueOrThrow: async (args: Row) => { assert.ok(find(args)[0]); return project(find(args)[0], args); },
      count: async (args: Row = {}) => find(args).length,
      create: async ({ data }: Row) => { check("create"); const row = { id: `new-${++serial}`, ...structuredClone(data) }; state[model].push(row); return structuredClone(row); },
      update: async ({ where, data }: Row) => { check("update"); const row = find({ where })[0]; assert.ok(row); return update(row, data); },
      updateMany: async ({ where, data }: Row) => { check("updateMany"); const rows = find({ where }); rows.forEach((row: Row) => update(row, data)); return { count: rows.length }; },
      delete: async ({ where }: Row) => { check("delete"); const row = find({ where })[0]; state[model] = state[model].filter((item: Row) => item !== row); return row; },
      deleteMany: async ({ where }: Row) => { check("deleteMany"); const rows = find({ where }); state[model] = state[model].filter((row: Row) => !rows.includes(row)); return { count: rows.length }; },
      aggregate: async (args: Row) => ({ _sum: { quantityLeft: find(args).reduce((sum: number, row: Row) => sum + row.quantityLeft, 0) } }),
    };
  }
  db.$transaction = async (fn: (tx: Row) => Promise<unknown>) => {
    let release: (() => void) | undefined, snapshot: Row | undefined;
    const tx = { ...db, $queryRaw: async (sql: TemplateStringsArray) => {
      if (sql.join("?").includes("pg_advisory_xact_lock") && !release) {
        const previous = tail; tail = new Promise<void>(resolve => { release = resolve; });
        await previous; snapshot = structuredClone(state);
      }
      return [];
    } };
    try { return await fn(tx); } catch (error) { if (snapshot) state = snapshot; throw error; } finally { release?.(); }
  };
  db.$executeRaw = async (sql: TemplateStringsArray, ...values: any[]) => {
    const [total, codes] = values, machine = sql.join("").includes('"machine"') ? values.at(-1) : undefined;
    for (const row of state.material) if (codes.includes(row.code) && (!machine || row.machine === machine)) row.quantity = total;
    return 1;
  };
  const stock = load("lib/material-stock-lot.ts");
  const declarations = load("lib/server/material-catalog-write.ts", { "@/lib/api": api,
    "@/lib/material-replacement-access": { canViewMaterialReplacement: (_access: Row, row: Row) => row.managingPosition === "A" } });
  const constants = { DEFECT_UNITS: ["S1", "S2", "COMMON"], roundStock: Math.round, isGasCylinderCategory: (value: string) => value === "Chai Khí",
    addMonths: (date: Date, months: number) => new Date(new Date(date).setMonth(date.getMonth() + months)) };
  const route = load("app/api/materials/route.ts", { "@/lib/prisma": { prisma: db }, "@/lib/api": api, "@/lib/constants": constants,
    "@/lib/equipment-dashboard-service": { invalidateEquipmentDashboardCache: () => {} },
    "@/lib/equipment-device": { EQUIPMENT_DEVICE_SELECT: {}, equipmentNodeToDevice: () => null },
    "@/lib/server-access": { resolveEquipmentAccessForUser: async () => ({}) }, "@/lib/material-catalog-access": {},
    "@/lib/material-stock-lot": stock, "@/lib/server/material-catalog-write": declarations,
    "@/lib/equipment-tree-scope": { assertSeqsInScope: () => {} }, "@/lib/s3": { maybeUploadDataUrl: async ({ value }: Row) => value },
    "@/lib/rbac-guard": { hasPermissionLevel: async () => true, requirePermissionLevel: async () => {} }, "@/lib/rbac-permissions": {},
    "@/lib/position-catalog": { positionsMatch: (a: string, b: string) => a === b, positionCodeOf: (value: string) => value },
    "@/lib/material-replacement-access": {}, "@/lib/position-data-scope": { resolvePositionViewScope: async () => ({ all: false }) },
  });
  return { db, stock, constants, route, tables: () => state, fail: (action: string) => { failure = action; },
    put: (body: Row) => route.PUT({ json: async () => ({ id: "m", ...body }) }),
    del: () => route.DELETE({ nextUrl: new URL("http://localhost/api/materials?id=m") }),
  };
}
function declaration(id: string, position = "A", links = 0) {
  return { id, materialId: "m", deviceSeq: `DH1.S1.1.${id}`, machine: "S1", system: null, location: null, managingPosition: position,
    managingPositionCode: position, isActive: false, intervalMonths: 6, quantity: 1, deviceCount: 1, lastReplacedAt: null,
    nextDueAt: new Date("2027-01-01"), _count: { logs: 0, ticketLinks: links, defectRequests: 0 } };
}

test("sửa khai báo giữ ID, liên kết phiếu, ngày hạn cũ và dòng của cương vị khác", async () => {
  const f = fixture(), a = declaration("a", "A", 1), b = declaration("b", "B");
  f.tables().materialReplacement.push(a, b);
  f.tables().materialTicketReplacement.push({ id: "link", ticketId: "ticket", replacementId: "a" });
  const response = await f.put({ replacements: [{ ...a, quantity: 5 }] });
  assert.equal(response.status, 200);
  assert.equal(f.tables().materialReplacement.length, 2);
  assert.equal(f.tables().materialReplacement[0].id, "a");
  assert.equal(f.tables().materialReplacement[0].quantity, 5);
  assert.deepEqual(f.tables().materialReplacement[1], b);
  assert.equal(f.tables().materialTicketReplacement[0].replacementId, "a");
  assert.equal(f.tables().materialReplacement[0].nextDueAt.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("chặn xoá điểm đã liên kết, sửa ngoài phạm vi và đổi thiết bị của điểm gắn phiếu", async () => {
  for (const body of [{ deletedReplacementIds: ["a"] }, { replacements: [{ ...declaration("a"), deviceSeq: "DH1.S1.1.other" }] },
    { deletedReplacementIds: ["b"] }, { replacements: [{ ...declaration("b", "B"), quantity: 8 }] }]) {
    const f = fixture(); f.tables().materialReplacement.push(declaration("a", "A", 1), declaration("b", "B"));
    const before = structuredClone(f.tables());
    assert.ok([403, 409].includes((await f.put(body)).status)); assert.deepEqual(f.tables(), before);
  }
});

test("chỉ xoá ID được yêu cầu; client cũ không gửi ID vẫn giữ ID khi vị trí khớp duy nhất", async () => {
  const f = fixture(), a = declaration("a"), b = declaration("b", "B"); f.tables().materialReplacement.push(a, b);
  const { id: _id, ...legacy } = a;
  assert.equal((await f.put({ replacements: [{ ...legacy, quantity: 2 }] })).status, 200);
  assert.equal(f.tables().materialReplacement[0].id, "a");
  assert.equal((await f.put({ deletedReplacementIds: ["a"] })).status, 200);
  assert.deepEqual(f.tables().materialReplacement, [b]);
});

test("lưu danh mục lỗi giữa chừng phải hoàn tác tên, tổ máy và điểm khai báo", async () => {
  const f = fixture(); f.tables().material.push({ ...f.tables().material[0], id: "s2", machine: "S2" });
  f.tables().materialReplacement.push({ ...declaration("s2-point"), materialId: "s2" });
  const before = structuredClone(f.tables());
  assert.equal((await f.put({ name: "Đổi tên", machines: ["S1"] })).status, 409);
  assert.deepEqual(f.tables(), before);
  assert.equal((await f.put({ name: "Đổi tên", machines: [] })).status, 400);
  assert.deepEqual(f.tables(), before);
});

test("thêm nhiều tổ máy và lô mở đầu cùng hoàn tác nếu tạo lô lỗi", async () => {
  const f = fixture(), before = structuredClone(f.tables());
  const create = () => f.route.POST({ json: async () => ({ code: "NEW", name: "Vật tư mới", unit: "Lít", quantity: 5, machines: ["S1", "S2"] }) });
  f.fail("materialStockLot.create");
  assert.equal((await create()).status, 500);
  assert.deepEqual(f.tables(), before);
  f.fail("");
  assert.equal((await create()).status, 200);
  assert.deepEqual(f.tables().material.filter((row: Row) => row.code === "NEW").map((row: Row) => [row.machine, row.quantity]), [["S1", 5], ["S2", 5]]);
  assert.equal(f.tables().materialStockLot.length, 1);
  assert.equal(f.tables().materialStockLot[0].stockUnit, "COMMON");
  assert.equal(f.tables().materialStockLot[0].quantityLeft, 5);
});

test("đổi mã chưa phát sinh giữ tài liệu; sửa S2 trả đúng dòng S2", async () => {
  const f = fixture();
  assert.equal((await f.put({ code: "NEW" })).status, 200);
  assert.equal(f.tables().material[0].code, "NEW");
  assert.equal(f.tables().material[0].documentUrl, "manual.pdf");
  f.tables().material.push({ ...f.tables().material[0], id: "s2", machine: "S2" });
  const response = await f.put({ id: "s2", name: "Sửa S2", machines: ["S1", "S2"] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.id, "s2");
});

test("xoá bị chặn hoặc lỗi khoá ngoại không được làm mất lịch sử tiêu hao", async () => {
  const f = fixture(); f.tables().equipmentMaterial.push({ id: "usage", materialId: "m" });
  f.fail("material.deleteMany");
  const before = structuredClone(f.tables());
  assert.equal((await f.del()).status, 500); assert.deepEqual(f.tables(), before);
  f.fail(""); f.tables().materialTicketItem.push({ id: "item", materialId: "m" });
  assert.equal((await f.del()).status, 409); assert.equal(f.tables().equipmentMaterial.length, 1);
});

test("mã đã có lô hoặc chứng từ không được đổi; bổ sung ERP mà giữ mã chính vẫn được", async () => {
  for (const model of ["materialStockLot", "materialTicketItem", "materialStockMovement", "materialReplacementLog", "defectMaterialRequest"]) {
    const f = fixture(); f.tables()[model].push({ id: "history", materialId: "m", materialCode: "OLD", quantityLeft: 0 });
    assert.equal((await f.put({ code: "NEW" })).status, 409);
    assert.equal(f.tables().material[0].code, "OLD");
    assert.equal((await f.put({ erpCodes: ["OLD", "EXTRA"] })).status, 200);
    assert.deepEqual(f.tables().material[0].erpCodes, ["OLD", "EXTRA"]);
  }
});

test("hai yêu cầu lấy 7 từ lô 10: chỉ một yêu cầu thành công, tồn còn 3", async () => {
  const f = fixture(); f.tables().materialStockLot.push({ id: "lot", materialCode: "OLD", stockUnit: "COMMON", quantityIn: 10, quantityLeft: 10, receivedAt: null });
  const results = await Promise.allSettled(["t1", "t2"].map(ticketId => f.db.$transaction((tx: Row) => f.stock.consumeStock(tx, { materialCode: "OLD", ticketId, quantity: 7 }))));
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(f.tables().materialStockLot[0].quantityLeft, 3); assert.equal(f.tables().materialLotUsage.length, 1);
});

test("từ chối phân bổ trùng lô trước khi trả hoặc trừ bất kỳ lượng kho nào", async () => {
  const f = fixture(); f.tables().materialStockLot.push({ id: "A", materialCode: "OLD", stockUnit: "COMMON", quantityIn: 10, quantityLeft: 10, receivedAt: null },
    { id: "B", materialCode: "OLD", stockUnit: "COMMON", quantityIn: 10, quantityLeft: 10, receivedAt: null });
  const before = structuredClone(f.tables());
  await assert.rejects(f.db.$transaction((tx: Row) => f.stock.consumeStock(tx, { materialCode: "OLD", ticketId: "t", quantity: 12,
    allocation: [{ lotId: "A", quantity: 6 }, { lotId: "A", quantity: 6 }] })), /không được phân bổ nhiều lần/);
  assert.deepEqual(f.tables(), before);
});

test("cấp phát đồng thời không được dựng lại tồn cũ sau khi yêu cầu khác đã tiêu hao", async () => {
  const f = fixture(); let id = 0;
  const other = load("lib/other-material-stock.ts", { "node:crypto": { randomUUID: () => `move-${++id}` }, "@/lib/constants": f.constants, "@/lib/material-stock-lot": f.stock });
  f.tables().material[0].quantity = 10;
  f.tables().materialStockLot.push({ id: "lot", materialCode: "OLD", stockUnit: "COMMON", quantityIn: 10, quantityLeft: 10, receivedAt: null });
  const material = structuredClone(f.tables().material[0]);
  const results = await Promise.allSettled([1, 2].map(() => f.db.$transaction((tx: Row) => other.consumeOtherMaterial(tx, {
    material, type: "USE", quantity: 7, occurredAt: new Date(), actor: { id: "u" }, note: "Sử dụng",
  }))));
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(f.tables().materialStockLot[0].quantityLeft, 3);
  assert.equal(f.tables().material[0].quantity, 3);
  assert.equal(f.tables().materialStockMovement.length, 1);
});

test("chai khí giữ kho S1 riêng, không lấy từ kho COMMON", async () => {
  const f = fixture();
  const other = load("lib/other-material-stock.ts", { "node:crypto": { randomUUID: () => "gas-move" }, "@/lib/constants": f.constants, "@/lib/material-stock-lot": f.stock });
  Object.assign(f.tables().material[0], { category: "Chai Khí", quantity: 3 });
  f.tables().materialStockLot.push({ id: "gas", materialCode: "OLD", stockUnit: "S1", quantityIn: 3, quantityLeft: 3, receivedAt: null },
    { id: "common", materialCode: "OLD", stockUnit: "COMMON", quantityIn: 10, quantityLeft: 10, receivedAt: null });
  await f.db.$transaction((tx: Row) => other.consumeOtherMaterial(tx, { material: structuredClone(f.tables().material[0]), type: "USE", quantity: 2, occurredAt: new Date(), actor: { id: "u" } }));
  assert.deepEqual(f.tables().materialStockLot.map((lot: Row) => lot.quantityLeft), [1, 10]);
  assert.equal(f.tables().material[0].quantity, 1);
});

test("hai lần xác nhận lãnh Vật tư khác chỉ trừ ERP và nhập hàng một lần", async () => {
  const f = fixture(); f.tables().materialTicket = [{ id: "ticket", type: "VAT_TU_KHAC", status: "NHAN_VAT_TU", unit: "S1", items: [
    { id: "item", erpCode: "ERP", material: { id: "m", code: "OLD", name: "Dầu", erpCodes: ["ERP"] } },
  ] }];
  f.tables().materialTicketItem.push({ id: "item", materialId: "m" });
  let readers = 0, release!: () => void, receives = 0;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let erpStock = 15;
  f.db.erpMaterial = {
    findMany: async () => [{ code: "ERP", erpStock }],
    updateMany: async ({ where, data }: Row) => {
      if (erpStock < where.erpStock.gte) return { count: 0 };
      erpStock -= data.erpStock.decrement; return { count: 1 };
    },
  };
  f.db.materialTicket = {
    findUnique: async () => structuredClone(f.tables().materialTicket[0]),
    update: async ({ data }: Row) => Object.assign(f.tables().materialTicket[0], data),
  };
  const file = "app/api/material-tickets/[id]/route.ts", imports: Row = {};
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  source.statements.filter(ts.isImportDeclaration).forEach(node => { imports[(node.moduleSpecifier as ts.StringLiteral).text] = {}; });
  Object.assign(imports, {
    "@/lib/prisma": { prisma: f.db }, "@/lib/api": api, "@/lib/material-stock-lot": f.stock,
    "@/lib/constants": { OTHER_MATERIAL_TICKET_TYPE: "VAT_TU_KHAC", OTHER_MATERIAL_ADVANCE_TICKET_TYPE: "VAT_TU_KHAC_UNG" },
    "@/lib/equipment-dashboard-service": { invalidateEquipmentDashboardCache: () => {} },
    "@/lib/material-ticket-bbnt-do": { ITEM_INCLUDE: {}, getTicket: async () => {
      const snapshot = structuredClone(f.tables().materialTicket[0]); if (++readers === 2) release(); await ready; return snapshot;
    } },
    "@/lib/material-workflow": { getWorkflowRoleMap: async () => ({}), stepAllowedWithMap: () => true },
    "@/lib/utils": { parseDateInput: (value: string) => new Date(value) },
    "@/lib/other-material-stock": { receiveOtherMaterial: async () => { receives++; } },
    "@/lib/material-ticket-sequence": { materialTicketReference: () => "VT-01" },
    "@/lib/material-ticket-telegram-alert": { notifyMaterialTicketStep: async () => {} },
  });
  const route = load(file, imports);
  const results = await Promise.all([1, 2].map(() => route.PUT({ json: async () => ({ action: "otherReceive", deliveryNoteNumber: "GH-01",
    items: [{ itemId: "item", receivedQuantity: 5 }] }) }, { params: Promise.resolve({ id: "ticket" }) })));
  assert.deepEqual(results.map((row: Response) => row.status).sort(), [200, 409], JSON.stringify(await Promise.all(results.map((row: Response) => row.clone().json()))));
  assert.equal(erpStock, 10); assert.equal(receives, 1);
});

test("mỗi biến thể cache kho, danh mục, phiếu, thiết bị và lịch đều hết hạn sau khi ghi", async () => {
  const qc = new QueryClient();
  const keys = [["material-stock-lots", "Dầu"], ["materials", "u", "full", {}], ["device", "node", "S2"], ["replacement", "point"],
    ["replacements", {}], ["material-ticket-options"], ["material-tickets"], ["other-material-stock"], ["equipment-dashboard"]];
  keys.forEach(key => qc.setQueryData(key, {})); await invalidateMaterialQueries(qc);
  assert.ok(keys.every(key => qc.getQueryState(key)?.isInvalidated)); qc.clear();
});
