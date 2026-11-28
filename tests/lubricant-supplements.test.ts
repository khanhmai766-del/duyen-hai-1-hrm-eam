import test from "node:test";
import assert from "node:assert/strict";
import { latestSupplements, supplementDeviceKey, supplementIdKey, type SupplementLog } from "../lib/lubricant-supplements";

const base: SupplementLog = {
  replacementId: "p1", deviceSeq: "D1", machine: "S1", materialId: "m1",
  replacedAt: "2026-05-01T03:00:00Z", usedQuantity: 5, quantity: 8, unitLabel: "Lít",
};

test("giữ ngày bổ sung mới nhất, ưu tiên khối lượng thực dùng", () => {
  const out = latestSupplements([base, { ...base, replacedAt: "2026-06-10T03:00:00Z", usedQuantity: null, quantity: 3 }]);
  assert.deepEqual(out[supplementIdKey("p1")], { date: "2026-06-10", quantity: 3, unit: "Lít" });
  assert.equal(out[supplementDeviceKey("D1", "S1", "m1")].date, "2026-06-10");
});

test("cộng dồn các dòng cùng ngày và tính ngày theo giờ Việt Nam", () => {
  const out = latestSupplements([base, { ...base, replacementId: null, usedQuantity: 2.5 }, { ...base, replacedAt: "2026-04-01T00:00:00Z" }]);
  assert.equal(out[supplementDeviceKey("D1", "S1", "m1")].quantity, 7.5);
  assert.equal(latestSupplements([{ ...base, replacedAt: "2026-05-01T20:00:00Z" }])[supplementIdKey("p1")].date, "2026-05-02");
});

test("dòng không có khoá nhận diện bị bỏ qua", () => {
  assert.deepEqual(latestSupplements([{ ...base, replacementId: null, deviceSeq: null }]), {});
});
