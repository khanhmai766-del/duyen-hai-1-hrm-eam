import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma, type PrismaClient } from "@prisma/client";
import { BACKUP_MAX_RECORDS, backupReceiptRow, backupTicketRows, readBackupChanges, readBackupSnapshot, type BackupRow } from "@/lib/material-backup-sync";
import type { MaterialTicketForN8nSync } from "@/lib/material-ticket-n8n-sync";

const now = new Date("2026-09-09T05:00:00.000Z");
const ticket: MaterialTicketForN8nSync = {
  id: "ticket-1", sequenceMonth: "202609", sequenceNumber: 1, sequenceScope: "MATERIAL",
  type: "DE_XUAT", unit: "S1", status: "HOAN_TAT", assignedPosition: "Vận hành",
  materialCategory: "Dầu", proposalNumber: "DX-10", proposalNote: "Bổ sung", pctNumber: "PCT-12", pctContent: "Nội dung PCT",
  bbntDoNumber: "BBNT-5", deliveryNoteNumber: "PGH-3", completionNote: "Đã thay dầu", bbktNumber: null,
  recoveryRequired: true, recoveryQuantity: 2, recoveryReturnedAt: now, recoveryDocNo: 3, recoveryDocNoYear: 2026,
  recoveryDocSentAt: now, recoveryDocSentByName: "Người nộp biên bản", recoveryDocSignedAt: now,
  createdByName: "Người tạo", proposedByName: "Người đề xuất", proposedByPosition: "Cương vị",
  proposedAt: now, confirmedByName: "Người xác nhận", deliveryScheduledAt: now, deliveryQuantity: 20,
  vhvReceivedQuantity: null, vhvReceivedByName: null, vhvReceivedAt: null,
  receivedQuantity: 10, receivedMethod: "ERP", receivedByName: "Người lãnh", receivedAt: now,
  usedQuantity: 8, remainingQuantity: 2, materialUserName: "Người dùng", usedByName: "Người nhập", usedAt: now,
  completedByName: "Người hoàn tất", completedAt: now, createdAt: now, updatedAt: now,
  items: [{ id: "item-1", erpCode: "00123", erpName: "Tên ERP", deviceNameManual: null,
    quantity: 12, receivedQuantity: 10, material: { code: "VT-1", name: "Dầu mẫu", unit: "lít", category: "Dầu" }, device: null }],
};
const material = backupTicketRows(ticket, "materials")[0];
assert.equal(material.values.length, 31);
assert.deepEqual(material.values.slice(13, 17), ["09/09/2026", "10 lít", "Người lãnh", "ERP · PGH-3"]);
assert.deepEqual(material.values.slice(17, 23), ["Người dùng", "09/09/2026", "Đã thay dầu", "PCT-12 · Nội dung PCT", "8 lít", "2 lít"]);
assert.equal(material.values[26], "BBNT-5");
assert.equal(material.values[27], "3/2026 · Kho ký trả lại: 09/09/2026 12:00:00");
assert.equal(material.values[28], "ticket-1:item-1");
const unsignedMaterial = backupTicketRows({ ...ticket, recoveryDocSignedAt: null }, "materials")[0];
assert.equal(unsignedMaterial.values[27], "3/2026");
const chemical = backupTicketRows({ ...ticket, type: "HOA_CHAT", sequenceScope: "CHEMICAL" }, "chemicals")[0];
assert.equal(chemical.values.length, 16);
assert.deepEqual(chemical.values.slice(4, 10), ["09/09/2026", "Cương vị", "Người đề xuất", "Dầu mẫu", "12 lít", "Bổ sung"]);
assert.equal(chemical.values[10], "Người xác nhận");
assert.equal(chemical.values[13], "ticket-1:item-1");
const receipt = backupReceiptRow({ id: "receipt-1", receivedAt: new Date("2026-09-09T00:00:00Z"), updatedAt: now,
  vehicleNumber: "51C00123", vehicleRef: null, plantWeight: new Prisma.Decimal("12.1256"), contractorWeight: null,
  acceptedWeight: new Prisma.Decimal("12.1256"), receivingPosition: null, receivingPositionRaw: "Cương vị gốc",
  item: { name: "NaOH", baseUnit: "KG" } });
assert.deepEqual(receipt.values.slice(0, 8), ["09/09/2026", "NaOH (kg)", "51C00123", 12.1256, null, 12.1256, "Cương vị gốc", "receipt:receipt-1"]);

function run(scope: "materials" | "chemicals" | "receipts", rows: BackupRow[], existing: unknown[][] = [], extras: Record<string, unknown> = {}) {
  const workflow = JSON.parse(readFileSync("docs/n8n-material-sync/workflow-backup-all.json", "utf8"));
  const sheetName = { materials: "VH1_VTDONGBO", chemicals: "VH1_HOACHAT_DONGBO", receipts: "NHAP_HOA_CHAT" }[scope];
  const config = {
    materials: { scope, sheetName, keyIndex: 28, sourceColumns: 31 },
    chemicals: { scope, sheetName, keyIndex: 13, sourceColumns: 16 },
    receipts: { scope, sheetName, keyIndex: 7, sourceColumns: 10 },
  }[scope];
  const headers = ["SYNC_KEY", "SOURCE_UPDATED_AT", "WORKFLOW_STATUS", "SYNCED_AT", "Tình trạng trên website", "Phát hiện không còn lúc"];
  const nodes = {
    "Cấu hình dự phòng": config,
    "Đọc thay đổi website": { data: rows, meta: { contract: "material-backup-v2", scope, complete: true,
      snapshotAt: now.toISOString(), watermark: now.toISOString(), changedEntityIds: [...new Set(rows.map((row) => row.entityId))],
      deletedEntityIds: [], inventory: null, rowCount: rows.length, ...extras } },
    "Đọc cấu trúc tab": { sheets: [{ properties: { sheetId: 42, title: config.sheetName, gridProperties: { rowCount: 10, columnCount: config.sourceColumns + 1 } } }] },
  };
  const embedded = workflow.nodes.find((node: { name: string }) => node.name === `Đối chiếu và lập gói ghi · ${sheetName}`).parameters.jsCode;
  const technicalExisting = existing.map((values) => (values as unknown[]).slice(config.keyIndex));
  const result = new Function("$", "$json", embedded)((name: string) => ({ first: () => ({ json: nodes[name.replace(` · ${sheetName}`, "") as keyof typeof nodes] }) }), { values: [headers, ...technicalExisting] });
  return { result, requests: result.flatMap((item: { json: { requests: unknown[] } }) => item.json.requests), config };
}
function valuesOf(request: any) {
  return request.updateCells?.rows[0].values.map((cell: any) => cell.userEnteredValue.stringValue ?? cell.userEnteredValue.numberValue ?? null);
}
const initial = run("materials", [material]);
assert.deepEqual(initial.requests.find((request: any) => request.updateCells?.start.rowIndex === 2)?.updateCells.start,
  { sheetId: 42, rowIndex: 2, columnIndex: 0 });
assert.ok(initial.requests.some((request: any) => request.updateSheetProperties?.properties.gridProperties.columnCount === 34));
const stored = [...material.values, "09/09/2026 11:00:00", "Đang lưu trên website", null];
const changed = { ...material, values: material.values.map((value, index) => index === 19 ? "Sửa nghiệm thu" : value) };
const edited = run("materials", [changed], [stored]);
assert.equal(edited.result[0].json.reusedRows, 0);
assert.equal(edited.requests.filter((request: any) => request.updateCells?.start.rowIndex === 2 && request.updateCells?.start.columnIndex === 0).length, 1);
const replaced = { ...material, syncKey: "ticket-1:item-new", values: material.values.map((value, index) => index === 28 ? "ticket-1:item-new" : value) };
const reused = run("materials", [replaced], [stored]);
assert.equal(reused.result[0].json.reusedRows, 1);
assert.equal(reused.result[0].json.missingRows, 0);
assert.ok(reused.requests.some((request: any) => request.updateCells?.start.rowIndex === 2 && valuesOf(request)?.[28] === replaced.syncKey));
const missing = run("materials", [], [stored], { deletedEntityIds: [material.entityId] });
assert.equal(missing.result[0].json.missingRows, 1);
assert.ok(missing.requests.some((request: any) => request.updateCells?.start.rowIndex === 2
  && request.updateCells.start.columnIndex === 32 && valuesOf(request)[0] === "Không còn trên website"));
assert.ok(!missing.requests.some((request: any) => request.deleteDimension || (request.updateCells?.start.rowIndex === 2 && request.updateCells.start.columnIndex === 0)));
const previouslyMissing = [...stored]; previouslyMissing[32] = "Không còn trên website"; previouslyMissing[33] = "08/09/2026 12:00:00";
const stillMissing = run("materials", [], [previouslyMissing], { deletedEntityIds: [material.entityId] });
assert.ok(stillMissing.requests.some((request: any) => valuesOf(request)?.[1] === previouslyMissing[33]));
const restored = run("materials", [material], [previouslyMissing]);
assert.ok(restored.requests.some((request: any) => valuesOf(request)?.[32] === "Đang lưu trên website" && valuesOf(request)?.[33] === null));
const outsideScope = run("materials", [], [stored], { changedEntityIds: [material.entityId] });
assert.ok(outsideScope.requests.some((request: any) => valuesOf(request)?.[0] === "Dòng vật tư đã thay đổi hoặc ngoài phạm vi"));
assert.throws(() => run("materials", [], [stored], { complete: false }), /không đầy đủ/);
assert.throws(() => run("materials", [], [stored], { rowCount: 1 }), /không đầy đủ/);
assert.throws(() => run("materials", [material, material]), /không hợp lệ/);
assert.throws(() => run("materials", [material], [stored, stored]), /Khóa trùng/);
const invalidStored = Array(material.values.length).fill(null); invalidStored[29] = "Dữ liệu nhập tay";
assert.throws(() => run("materials", [material], [invalidStored]), /thiếu SYNC_KEY/);
for (const [scope, row] of [["chemicals", chemical], ["receipts", receipt]] as const) {
  const check = run(scope, [row]);
  assert.equal(check.result[0].json.sourceRows, 1);
  assert.equal(check.result[0].json.missingRows, 0);
}
const manyRows = Array.from({ length: 250 }, (_, index) => ({ ...material, entityId: `ticket-${index}`, syncKey: `ticket-${index}:item`,
  values: material.values.map((value, col) => col === 28 ? `ticket-${index}:item` : value) }));
const large = run("materials", manyRows);
assert.ok(large.result.length > 1);
assert.ok(large.requests.some((request: any) => request.updateSheetProperties?.properties.gridProperties.rowCount === 252));
assert.equal(large.requests.filter((request: any) => request.updateCells?.start.columnIndex === 0).length, 250);
const receiptFormat = run("receipts", [receipt]);
const formatRequest = receiptFormat.requests.find((request: any) => request.updateCells?.start.columnIndex === 3 && request.updateCells?.fields === "userEnteredFormat.numberFormat");
assert.deepEqual(formatRequest.updateCells.rows[0].values.map((cell: any) => cell.userEnteredFormat.numberFormat.pattern),
  ["#,##0.####", "#,##0.####", "#,##0.####"]);

async function main() {
  let transactionOptions: unknown;
  const mock = {
    $transaction: async (callback: (tx: unknown) => unknown, options: unknown) => {
      transactionOptions = options;
      return callback({ materialTicket: { findMany: async (args: { select?: unknown }) => args.select ? [{ id: ticket.id }] : [ticket] } });
    },
  } as unknown as PrismaClient;
  const snapshot = await readBackupSnapshot(mock, "materials");
  assert.equal(snapshot.meta.complete, true);
  assert.equal(snapshot.meta.rowCount, 1);
  assert.deepEqual(transactionOptions, { isolationLevel: "RepeatableRead", timeout: 30_000 });
  let receiptChangeQuery: any;
  const incrementalDb = {
    $transaction: async (callback: (tx: unknown) => unknown, options: unknown) => {
      transactionOptions = options;
      return callback({
        chemicalReceipt: { findMany: async (args: any) => {
          if (args.where?.updatedAt) { receiptChangeQuery = args; return [{
            id: "receipt-1", receivedAt: new Date("2026-09-09T00:00:00Z"), updatedAt: now,
            vehicleNumber: "51C00123", vehicleRef: null, plantWeight: new Prisma.Decimal(12), contractorWeight: null,
            acceptedWeight: new Prisma.Decimal(12), receivingPosition: null, receivingPositionRaw: null,
            item: { name: "NaOH", baseUnit: "KG" },
          }]; }
          return [];
        } },
        auditLog: { findMany: async () => [] },
      });
    },
  } as unknown as PrismaClient;
  const incremental = await readBackupChanges(incrementalDb, "receipts", new Date("2026-09-09T04:00:00Z"), false);
  assert.equal(incremental.meta.contract, "material-backup-v2");
  assert.equal(incremental.meta.inventory, null);
  assert.equal(incremental.rows.length, 1);
  assert.equal(receiptChangeQuery.where.updatedAt.gt.toISOString(), "2026-09-09T03:59:00.000Z");
  const overLimit = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      chemicalReceipt: { findMany: async () => Array(BACKUP_MAX_RECORDS + 1).fill({}) },
    }),
  } as unknown as PrismaClient;
  await assert.rejects(readBackupSnapshot(overLimit, "receipts"), /vượt/);
  {
    const workflow = JSON.parse(readFileSync("docs/n8n-material-sync/workflow-backup-all.json", "utf8"));
    assert.equal(workflow.active, false);
    assert.equal(workflow.settings.timezone, "Asia/Ho_Chi_Minh");
    const names = new Set(workflow.nodes.map((node: { name: string }) => node.name));
    assert.equal(names.size, workflow.nodes.length);
    assert.equal(new Set(workflow.nodes.map((node: { id: string }) => node.id)).size, workflow.nodes.length);
    const schedules = workflow.nodes.filter((node: { type: string }) => node.type === "n8n-nodes-base.scheduleTrigger");
    assert.deepEqual(schedules.map((node: any) => node.parameters.rule.interval[0].expression), ["17 12 * * * *", "29 16 * * * *", "47 19 * * * *"]);
    const reachable = (start: string): Set<string> => {
      const found = new Set<string>();
      const visit = (name: string) => {
        if (found.has(name)) return;
        found.add(name);
        for (const edge of workflow.connections[name]?.main.flat() ?? []) visit(edge.node);
      };
      visit(start); return found;
    };
    const manualNodes = reachable("Chạy thủ công cả 3 tab");
    for (const schedule of schedules) {
      const branchNodes = reachable(schedule.name);
      assert.equal([...branchNodes].filter((name) => name.startsWith("Kết quả ·")).length, 1);
      assert.equal([...branchNodes].filter((name) => name.startsWith("Ghi bản dự phòng ·")).length, 1);
      for (const name of branchNodes) if (name !== schedule.name) assert.ok(manualNodes.has(name));
    }
    assert.equal([...manualNodes].filter((name) => name.startsWith("Kết quả ·")).length, 3);
    for (const sheetName of ["VH1_VTDONGBO", "VH1_HOACHAT_DONGBO", "NHAP_HOA_CHAT"]) {
      const decision = workflow.connections[`Có thay đổi hoặc cần đối chiếu? · ${sheetName}`].main;
      assert.equal(decision[0][0].node, `Đọc cấu trúc tab · ${sheetName}`);
      assert.equal(decision[1][0].node, `Lưu mốc khi không đổi · ${sheetName}`);
      assert.equal(workflow.connections[`Lưu mốc khi không đổi · ${sheetName}`], undefined);
      const keyNode = workflow.nodes.find((node: { name: string }) => node.name === `Đọc khóa dự phòng · ${sheetName}`);
      assert.match(keyNode.parameters.url, /!(AC|N|H)2:(AH|S|M)/);
    }
    for (const node of workflow.nodes) {
      if (node.type === "n8n-nodes-base.code") new Function(node.parameters.jsCode);
      if (node.parameters.url?.includes('sheets.googleapis.com')) assert.ok(node.parameters.url.includes('1wamJN787FowPLI3zU-383CME5R-EkI72EP5qLrhj5J4'));
      assert.equal(node.credentials, undefined);
    }
    for (const connection of Object.values(workflow.connections) as any[]) {
      for (const output of connection.main.flat()) assert.ok(names.has(output.node));
    }
  }
  console.log("Đạt: mapping 3 tab; sửa cùng dòng/đổi item; giữ hồ sơ thiếu; thời điểm phát hiện; khôi phục; chặn dữ liệu thiếu/trùng; >200 dòng; lưới và chia gói; ảnh chụp nhất quán; giới hạn; cấu trúc workflow.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
