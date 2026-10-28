import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import type { FullTicket } from "../lib/material-ticket-bbnt-do";
import { adjustReceiptErp, parseProposalReceipt, recordProposalReceipt, receiptSkippedErpDeduction } from "../lib/server/material-proposal-receipt";

const body = { receivedQuantity: 33, deliveryNoteNumber: " 03.YY1.40.0453 ", deliveryNoteDate: "2026-10-27" };

function fixture(erpStock: number) {
  const ticket = {
    id: "ticket-40", type: "DE_XUAT", status: "NHAN_VAT_TU", materialCategory: "Dầu bôi trơn", unit: "S1",
    updatedAt: new Date("2026-10-28T01:00:00Z"), receivedAt: null, usedQuantity: null,
    items: [{ id: "item", material: { code: "oil", erpCodes: ["ERP-OIL"], unit: "Lít" } }],
  } as unknown as FullTicket;
  const state = { erpStock, materialStock: 0, lot: null as Record<string, unknown> | null, claimed: false, erpWrites: 0 };
  const tx = {
    materialTicket: {
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.status, "NHAN_VAT_TU");
        assert.equal(where.receivedAt, null);
        if (state.claimed) return { count: 0 };
        state.claimed = true;
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(ticket, data); return ticket; },
    },
    materialTicketItem: { update: async () => ({}) },
    erpMaterial: { update: async ({ data }: { data: { erpStock: { decrement?: number; increment?: number } } }) => {
      state.erpWrites++;
      state.erpStock += (data.erpStock.increment ?? 0) - (data.erpStock.decrement ?? 0);
    } },
    $queryRaw: async (sql: TemplateStringsArray) => {
      assert.match(sql.join("?"), /FOR UPDATE/);
      return [{ erpStock: state.erpStock }];
    },
    $executeRaw: async (sql: TemplateStringsArray, total: number) => {
      assert.match(sql.join("?"), /UPDATE "Material"/);
      state.materialStock = total;
      return 1;
    },
    materialStockLot: {
      findFirst: async () => state.lot,
      findUnique: async () => state.lot,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.lot = { id: "lot", note: null, ...data };
        return state.lot;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.lot!, data);
        return state.lot;
      },
      aggregate: async () => ({ _sum: { quantityLeft: state.lot?.quantityLeft ?? 0 } }),
    },
  } as unknown as Prisma.TransactionClient;
  const params = { ticket, receipt: parseProposalReceipt(body), erpCode: "ERP-OIL", erpName: "Dầu Sinopec L-TSA46",
    photoKey: "linked-lien-3.jpg", actor: { id: "operator", name: "Người lãnh" }, stockOptions: { stockUnit: "COMMON" } };
  return { state, ticket, tx, params };
}

for (const stock of [0, 12, 33, 100]) {
  test(`ERP ${stock}: ghi đủ 33 lít theo liên 3, chỉ trừ ERP khi đủ`, async () => {
    const f = fixture(stock);
    const result = await recordProposalReceipt(f.tx, f.params);
    assert.equal(f.state.erpStock, stock >= 33 ? stock - 33 : stock);
    assert.equal(f.state.erpWrites, stock >= 33 ? 1 : 0);
    assert.equal(result.deductErp, stock >= 33);
    assert.equal(f.state.materialStock, 33);
    assert.equal(f.state.lot?.deliveryNote, "03.YY1.40.0453");
    assert.equal(f.state.lot?.quantityIn, 33);
    assert.equal(f.state.lot?.deliveryPhotoKey, "linked-lien-3.jpg");
    assert.equal(receiptSkippedErpDeduction(f.state.lot?.note as string | null), stock < 33);
    assert.equal(f.ticket.status, "CHO_PHIEU_YCSC");
    assert.equal(f.ticket.deliveryNoteDate?.toISOString().slice(0, 10), "2026-10-27");
    assert.equal(f.ticket.receivedQuantity, 33);
  });
}

test("hai lần xác nhận cùng phiếu chỉ được cộng Hiện có/trừ ERP một lần", async () => {
  const f = fixture(100);
  const results = await Promise.allSettled([recordProposalReceipt(f.tx, f.params), recordProposalReceipt(f.tx, f.params)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason instanceof Response && rejected.reason.status, 409);
  assert.equal(f.state.materialStock, 33);
  assert.equal(f.state.erpStock, 67);
});

test("thiếu liên 3 không được ghi kho dù ERP đủ hay thiếu", async () => {
  for (const stock of [0, 12, 100]) {
    const f = fixture(stock);
    await assert.rejects(recordProposalReceipt(f.tx, { ...f.params, photoKey: "" }), e => e instanceof Response && e.status === 400);
    assert.equal(f.state.materialStock, 0);
    assert.equal(f.state.erpStock, stock);
    assert.equal(f.state.claimed, false);
  }
});

test("thiếu số phiếu, thiếu/sai ngày hoặc khối lượng không hợp lệ đều bị chặn", () => {
  for (const patch of [
    { deliveryNoteNumber: " " }, { deliveryNoteDate: undefined }, { deliveryNoteDate: "" },
    { deliveryNoteDate: "2026-02-30" }, { deliveryNoteDate: "không hợp lệ" },
    ...[0, -1, 1.5, NaN, Infinity].map(receivedQuantity => ({ receivedQuantity })),
  ]) {
    assert.throws(() => parseProposalReceipt({ ...body, ...patch }), e => e instanceof Response && e.status === 400);
  }
});

test("phiếu cũ mặc định đã trừ ERP; lô nhập theo chứng từ giữ được dấu khi sửa sau này", () => {
  assert.equal(receiptSkippedErpDeduction(null), false);
  assert.equal(receiptSkippedErpDeduction("Ghi chú lô cũ"), false);
  assert.equal(parseProposalReceipt(body).deliveryNoteDate.toISOString(), "2026-10-27T00:00:00.000Z");
});

test("sửa lượng lãnh của lô xác nhận theo chứng từ không hoàn/trừ ERP, kể cả ERP đã đồng bộ tăng lại", async () => {
  const f = fixture(12);
  await recordProposalReceipt(f.tx, f.params);
  f.state.erpStock = 100;
  for (const delta of [-10, 10]) {
    await adjustReceiptErp(f.tx, { erpCode: "ERP-OIL", delta, skipDeduction: receiptSkippedErpDeduction(f.state.lot?.note as string) });
    assert.equal(f.state.erpStock, 100);
    assert.equal(f.state.erpWrites, 0);
  }
});

test("sửa lô đã trừ ERP vẫn điều chỉnh chênh lệch như cũ và không cho ERP âm", async () => {
  const f = fixture(100);
  await recordProposalReceipt(f.tx, f.params);
  await adjustReceiptErp(f.tx, { erpCode: "ERP-OIL", delta: -7, skipDeduction: false });
  assert.equal(f.state.erpStock, 60);
  await adjustReceiptErp(f.tx, { erpCode: "ERP-OIL", delta: 10, skipDeduction: false });
  assert.equal(f.state.erpStock, 70);
  await assert.rejects(adjustReceiptErp(f.tx, { erpCode: "ERP-OIL", delta: -71, skipDeduction: false }), e => e instanceof Response && e.status === 400);
  assert.equal(f.state.erpStock, 70);
});
