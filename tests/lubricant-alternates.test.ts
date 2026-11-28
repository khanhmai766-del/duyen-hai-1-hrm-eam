import test from "node:test";
import assert from "node:assert/strict";
import { findPointSupplement, latestSupplements, type SupplementLog } from "../lib/lubricant-supplements";
import { resolveRowLink, type RowLinkOverride } from "../lib/lubricant-row-links";

const log: SupplementLog = {
  replacementId: null, deviceSeq: "D1", machine: "S1", materialId: "alt-oil",
  replacedAt: "2026-06-10T03:00:00Z", usedQuantity: 4, quantity: null, unitLabel: "Lít",
};
const point = { id: "p1", deviceSeq: "D1", machine: "S1", materialId: "main-oil", alternateMaterialIds: ["alt-oil"] };

test("log của dầu thay thế được tính cho điểm qua khoá thiết bị + tổ máy + vật tư", () => {
  const data = latestSupplements([log]);
  assert.deepEqual(findPointSupplement(point, data), { date: "2026-06-10", quantity: 4, unit: "Lít" });
});

test("điểm không khai dầu thay thế thì không nhận log của dầu khác", () => {
  const data = latestSupplements([log]);
  assert.equal(findPointSupplement({ ...point, alternateMaterialIds: [] }, data), undefined);
  assert.equal(findPointSupplement({ ...point, machine: "S2" }, data), undefined);
});

test("chọn lần bổ sung mới nhất giữa dầu chính và dầu thay thế", () => {
  const data = latestSupplements([
    log,
    { ...log, materialId: "main-oil", replacedAt: "2026-07-01T03:00:00Z", usedQuantity: 2 },
  ]);
  assert.equal(findPointSupplement(point, data)?.date, "2026-07-01");
  // khoá theo id điểm vẫn thắng nếu mới hơn
  const withId = latestSupplements([log, { ...log, replacementId: "p1", materialId: "alt-oil", replacedAt: "2026-08-01T03:00:00Z" }]);
  assert.equal(findPointSupplement(point, withId)?.date, "2026-08-01");
});

const p1 = { id: "p1" };
const p2 = { id: "p2" };
const byId = new Map([[p1.id, p1], [p2.id, p2]]);
const override = (mode: RowLinkOverride["mode"], replacementId: string | null = null): RowLinkOverride =>
  ({ sourceKey: "Lò S1:1", mode, replacementId, updatedByName: "Admin", updatedAt: "2026-11-28T00:00:00Z" });

test("không có quyết định tay: giữ liên kết tự động", () => {
  assert.deepEqual(resolveRowLink([p1], false, undefined, byId), { points: [p1], excelOnly: false });
  assert.deepEqual(resolveRowLink([], true, undefined, byId), { points: [], excelOnly: true });
});

test("quyết định point ghi đè liên kết tự động", () => {
  const out = resolveRowLink([p1], false, override("point", "p2"), byId);
  assert.deepEqual(out.points, [p2]);
  assert.equal(out.manual?.updatedByName, "Admin");
});

test("quyết định excel / none bỏ điểm tự động; none thắng cả danh sách Excel của JSON", () => {
  assert.deepEqual(resolveRowLink([p1], false, override("excel"), byId).points, []);
  assert.equal(resolveRowLink([p1], false, override("excel"), byId).excelOnly, true);
  const none = resolveRowLink([], true, override("none"), byId);
  assert.deepEqual([none.points, none.excelOnly], [[], false]);
});

test("điểm được gắn tay đã biến mất thì quay về liên kết tự động", () => {
  const out = resolveRowLink([p1], false, override("point", "gone"), byId);
  assert.deepEqual(out, { points: [p1], excelOnly: false });
});
