import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as constants from "../lib/constants";
import type { getEquipmentDashboard } from "../lib/equipment-dashboard-service";

function fixture(empty = false) {
  const codes = empty ? [] : [
    ...Array.from({ length: 8 }, (_, i) => `repair-${i}`),
    ...Array.from({ length: 10 }, (_, i) => `warn-${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `defect-${i + 1}`), "hidden", "sampling",
  ];
  const nodes = codes.map(seq => ({ seq, name: seq, parentSeq: null }));
  const visible = new Set(codes.filter(code => code !== "hidden"));
  const replacements = codes.flatMap(code => Array.from({ length: code.startsWith("warn-") ? Number(code.split("-")[1]) : ["hidden", "sampling"].includes(code) ? 50 : 0 }, (_, i) => ({
    id: `${code}-${i}`, deviceSeq: code, system: null, nextDueAt: new Date("2020-01-01"), samplingOnly: code === "sampling",
    material: { name: "Dầu", system: null }, device: { seq: code, name: code },
  })));
  const defects = codes.flatMap(code => Array.from({ length: code.startsWith("defect-") ? Number(code.split("-")[1]) : 0 }, () => ({
    deviceSeq: code, status: "CHUA_XU_LY", severity: "2", postRepairAwaitingMaterial: false, createdAt: new Date(), requestType: "CO",
  })));
  const imports: Record<string, unknown> = {
    "@/lib/constants": constants,
    "@/lib/defect-active-where": { activeDefectWhere: () => ({}), isOutstandingDefect: () => true },
    "@/lib/equipment-node-cache": {
      getCachedEquipmentNodeList: async () => nodes,
      getEquipmentTreeIndexFor: () => ({ childrenOf: new Map(), parentOf: new Map(), bySeq: new Map(nodes.map(node => [node.seq, node])) }),
    },
    "@/lib/nav": { normalizeText: (value: string) => value.toLowerCase() },
    "@/lib/position-catalog": {},
    "@/lib/oil-grouping-sync": { GROUPABLE_CATEGORIES: [] },
    "@/lib/positions": { selectableManagingPositionOptions: () => [] },
    "@/lib/position-system-scopes": { normalizePositionScopeKey: () => "", positionScopeOptions: () => [] },
    "@/lib/prisma": { prisma: {
      user: { findMany: async () => [] }, defect: { findMany: async () => defects }, defectHistory: { findMany: async () => [] },
      materialReplacement: { findMany: async () => replacements }, oilType: { groupBy: async () => [] },
      repairLog: { groupBy: async () => codes.filter(code => code.startsWith("repair-")).map(deviceSeq => ({ deviceSeq, _count: { _all: 1000 } })) },
    } },
    "@/lib/rbac-permissions": { hasAssignedManagePermission: async () => false },
    "@/lib/server-access": {
      equipmentSeqWhere: () => undefined, loadPositionSystemScopeRows: async () => [],
      resolveEquipmentAccessForUser: async () => ({ visibleSeqs: visible, hasExplicitScopes: true, canViewSeq: (seq: string) => visible.has(seq) }),
    },
    "@/lib/utils": {},
  };
  const mod = { exports: {} as { getEquipmentDashboard: typeof getEquipmentDashboard } };
  const code = ts.transpileModule(readFileSync("lib/equipment-dashboard-service.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(name in imports, `Thiếu mock ${name}`);
    return imports[name];
  }, mod, mod.exports);
  return mod.exports.getEquipmentDashboard;
}

test("hai biểu đồ xếp hạng riêng trước khi lấy 8 thiết bị, giữ phạm vi quyền và loại điểm chỉ lấy mẫu", async () => {
  const { data } = await fixture()({ id: "test", role: "TECHNICIAN" }, {});
  assert.deepEqual(data.replacementChartRows.map(row => [row.code, row.replacementWarn]),
    Array.from({ length: 8 }, (_, i) => [`warn-${10 - i}`, 10 - i]));
  assert.deepEqual(data.defectChartRows.map(row => [row.code, row.openDefectCount]),
    Array.from({ length: 8 }, (_, i) => [`defect-${10 - i}`, 10 - i]));
});

test("không có thiết bị thì cả hai danh sách xếp hạng rỗng", async () => {
  const { data } = await fixture(true)({ id: "test", role: "TECHNICIAN" }, {});
  assert.deepEqual(data.replacementChartRows, []);
  assert.deepEqual(data.defectChartRows, []);
});
