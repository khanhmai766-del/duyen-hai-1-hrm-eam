import test from "node:test";
import assert from "node:assert/strict";
import { latestSupplements, manualSupplementLogs, sortSupplementHistory, supplementDayToDate, vnDay, type SupplementHistoryItem, supplementDeviceKey, supplementIdKey, type SupplementLog } from "../lib/lubricant-supplements";

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

test("gộp lần bổ sung nhập tay với phiếu: ngày mới nhất thắng, cùng ngày cộng dồn", () => {
  const manual = (suppliedAt: string, quantity: number | null) =>
    manualSupplementLogs([{ replacementId: "p1", suppliedAt: supplementDayToDate(suppliedAt), quantity, unit: "Lít" }]);
  const newer = latestSupplements([base, ...manual("2026-07-01", 4)]);
  assert.deepEqual(newer[supplementIdKey("p1")], { date: "2026-07-01", quantity: 4, unit: "Lít" });
  const sameDay = latestSupplements([base, ...manual("2026-05-01", 2)]);
  assert.equal(sameDay[supplementIdKey("p1")].quantity, 7);
  assert.equal(latestSupplements([base, ...manual("2026-04-01", 9)])[supplementIdKey("p1")].date, "2026-05-01");
  assert.equal(latestSupplements(manual("2026-07-01", null))[supplementIdKey("p1")].quantity, null);
  assert.equal(supplementDeviceKey("D1", "S1", "m1") in latestSupplements(manual("2026-07-01", 1)), false);
});

test("ngày nhập tay giữ nguyên theo giờ Việt Nam và lịch sử xếp mới nhất trước", () => {
  assert.equal(vnDay(supplementDayToDate("2026-03-09")), "2026-03-09");
  const item = (id: string, source: "manual" | "ticket", date: string): SupplementHistoryItem =>
    ({ id, source, sourceLabel: "", date, quantity: null, unit: null, materialName: null, note: null, byName: null, deletable: false });
  const sorted = sortSupplementHistory([item("a", "ticket", "2026-05-01"), item("b", "manual", "2026-06-01"), item("c", "manual", "2026-05-01")]);
  assert.deepEqual(sorted.map((row) => row.id), ["b", "c", "a"]);
});
