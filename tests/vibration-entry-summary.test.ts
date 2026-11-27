// Chạy: npx tsx --test tests/vibration-entry-summary.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { MNK_AREA, MNK_SHIFT_NAMES } from "../lib/vibration/constants";
import { computeEntrySummary, groupDueDate, hasEntryRecord, nthThursday } from "../lib/vibration/entry-summary";

// 2026-11-27 là thứ 6.
const T = "2026-11-27";
const dev = (id: string, area: string, measureGroups: string[] = [], name = id, active = true) => ({ id, area, name, active, measureGroups });

test("hạn của từng kỳ", () => {
  assert.equal(groupDueDate("hangngay", T), "2026-11-26");
  assert.equal(groupDueDate("mnkca", T), "2026-11-26");
  assert.equal(groupDueDate("thu5", T), "2026-11-26");
  assert.equal(groupDueDate("thu6", T), "2026-11-20"); // hôm nay chưa tới hạn: lần thứ 6 đã qua
  assert.equal(groupDueDate("thu2", T), "2026-11-23");
  assert.equal(groupDueDate("chunhat", T), "2026-11-22");
  assert.equal(nthThursday(2026, 11, 1), "2026-11-05");
  assert.equal(groupDueDate("tuan4", T), "2026-11-26");
  assert.equal(groupDueDate("tuan1", T), "2026-11-05");
  assert.equal(groupDueDate("tuan4", "2026-11-10"), "2026-10-22"); // chưa tới thứ 5 tuần 4 tháng này → tháng trước
  assert.equal(groupDueDate("tuan1", "2026-01-01"), "2025-12-04"); // 01/01 chưa qua → tháng trước
  assert.equal(groupDueDate("tuan1", "2026-01-02"), "2026-01-01");
  assert.equal(groupDueDate("xyz", T), null);
});

test("hasEntryRecord: số đo, millData số, hoặc ghi chú đều tính", () => {
  assert.equal(hasEntryRecord({ deviceId: "a", date: T, values: [null, "", null] }), false);
  assert.equal(hasEntryRecord({ deviceId: "a", date: T, values: [null, 3.2] }), true);
  assert.equal(hasEntryRecord({ deviceId: "a", date: T, values: [], note: "Máy dự phòng" }), true);
  assert.equal(hasEntryRecord({ deviceId: "a", date: T, values: [], note: "  " }), false);
  assert.equal(hasEntryRecord({ deviceId: "a", date: T, millData: { schemaVersion: 2, shift: 1 } }), false);
  assert.equal(hasEntryRecord({ deviceId: "a", date: T, millData: { x: 4 } }), true);
});

test("đếm đã nhập / chưa nhập theo cương vị, ghi chú tính là đã nhập, thiết bị không hoạt động bị bỏ", () => {
  const devices = [dev("d1", "ESP S1"), dev("d2", "ESP S1"), dev("d3", "ESP S1", [], "d3", false), dev("d4", "FGD S1"), dev("d5", "FGD S1")];
  const records = [
    { deviceId: "d1", date: "2026-11-26", values: [1] },
    { deviceId: "d2", date: "2026-11-27", values: [], note: "Ngừng sửa chữa" },
    { deviceId: "d4", date: "2026-11-25", values: [1] }, // trước hạn (thu5 = 26/11) → chưa tính
  ];
  const s = computeEntrySummary({ devices, records, date: T, group: "thu5" });
  assert.deepEqual(s.rows.map((r) => [r.area, r.total, r.entered, r.complete]), [["ESP S1", 2, 2, true], ["FGD S1", 2, 0, false]]);
  assert.deepEqual(s.rows[1].missing.map((m) => m.id), ["d4", "d5"]);
  assert.deepEqual(s.totals, { areas: 2, areasComplete: 1, devices: 4, entered: 2, missing: 2, percent: 50 });
  assert.equal(computeEntrySummary({ devices, records, date: T, group: "thu5", area: "FGD S1" }).totals.areas, 1);
  assert.deepEqual(s.areas, ["ESP S1", "FGD S1"]);
});

test("bản ghi sau ngày tham chiếu không tính; kỳ khác bị lọc; mặc định thu5; 'all' tách theo từng kỳ của thiết bị", () => {
  const devices = [dev("a", "ESP S1", ["hangngay", "thu2"]), dev("b", "ESP S1", ["thu2"])];
  const records = [{ deviceId: "a", date: "2026-11-28", values: [1] }, { deviceId: "a", date: "2026-11-26", values: [1] }];
  assert.equal(computeEntrySummary({ devices, records, date: T, group: "thu5" }).rows.length, 0);
  const all = computeEntrySummary({ devices, records, date: T, group: "all" });
  assert.deepEqual(all.rows.map((r) => [r.group, r.total, r.entered]), [["thu2", 2, 1], ["hangngay", 1, 1]]);
  const def = computeEntrySummary({ devices: [dev("z", "ESP S1")], records: [], date: T, group: "thu5" });
  assert.equal(def.totals.devices, 1);
});

test("MNK: loại khỏi kỳ thường; kỳ mnkca = 14 động cơ, hạn hôm qua", () => {
  const names = Object.values(MNK_SHIFT_NAMES).flat();
  const mnk = names.map((n, i) => dev(`m${i}`, MNK_AREA, ["hangngay"], n));
  const devices = [...mnk, dev("o", MNK_AREA, ["hangngay"], "Máy khác")];
  assert.equal(names.length, 14);
  assert.equal(computeEntrySummary({ devices, records: [], date: T, group: "hangngay" }).totals.devices, 1);
  const records = [{ deviceId: "m0", date: "2026-11-26", millData: { a: 1 } }, { deviceId: "m1", date: "2026-11-25", values: [1] }];
  const s = computeEntrySummary({ devices, records, date: T, group: "mnkca" });
  assert.deepEqual([s.rows[0].total, s.rows[0].entered, s.rows[0].due], [14, 1, "2026-11-26"]);
});
