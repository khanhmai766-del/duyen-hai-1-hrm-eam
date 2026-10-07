import assert from "node:assert/strict";
import test from "node:test";
import { assignGroundingShifts, currentGroundingSlot, groundingSlotWindow, inspectionInGroundingSlot, requestedGroundingSlot } from "../../lib/grounding-inspection-schedule";
import { SHIFT_TYPE_ORDER } from "../../lib/constants";

const items = (count: number, positionCode = "BOILER_DEPUTY", machine = "S1") => Array.from({ length: count }, (_, i) => ({
  id: `${positionCode}-${machine}-${i}`, positionCode, machine, areaEquipment: `Khu vực ${String(i).padStart(3, "0")}`,
}));

test("Mỗi khu vực được giao đúng một ca và số khu vực chênh không quá một với nhóm đủ 3 khu vực", () => {
  for (const count of [3, 4, 5, 7, 8, 10, 31, 202]) {
    const rows = items(count), plan = assignGroundingShifts(rows);
    const counts = SHIFT_TYPE_ORDER.map((shift) => rows.filter((row) => plan.get(row.id)?.includes(shift)).length);
    assert.equal(plan.size, count);
    assert.equal(counts.reduce((a, b) => a + b), count);
    assert.ok(counts.every((n) => n > 0));
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.ok([...plan.values()].every((shifts) => shifts.length === 1));
  }
});

test("Nhóm có 1–2 khu vực chỉ kiểm tra đủ số lượng, không giao lặp và không bắt ca còn lại kiểm tra", () => {
  for (const [count, expectedCounts] of [[1, [1, 0, 0]], [2, [1, 1, 0]]] as const) {
    const rows = items(count), plan = assignGroundingShifts(rows);
    const counts = SHIFT_TYPE_ORDER.map((shift) => rows.filter((row) => plan.get(row.id)?.includes(shift)).length);
    assert.deepEqual(counts, expectedCounts);
    assert.equal(counts.reduce((a, b) => a + b), count);
    assert.ok([...plan.values()].every((shifts) => shifts.length === 1));
  }
  assert.equal(assignGroundingShifts([]).size, 0);
});

test("Chia độc lập theo cương vị và tổ máy, không phụ thuộc thứ tự trả về", () => {
  const a = items(7), b = items(2, "BOILER_DEPUTY", "S2"), c = items(10, "TURBINE_DEPUTY");
  const mixed = [...a, ...b, ...c];
  const assignments = assignGroundingShifts(mixed.reverse());
  for (const group of [a, b, c]) {
    const expected = assignGroundingShifts(group);
    for (const row of group) assert.deepEqual(assignments.get(row.id), expected.get(row.id));
  }
});

test("Giờ Việt Nam: đổi ca ở 06/14/22h; qua nửa đêm vẫn thuộc ngày trước", () => {
  const cases = [
    ["2026-10-06T05:59:59+07:00", "2026-10-05", "NIGHT"],
    ["2026-10-06T06:00:00+07:00", "2026-10-06", "MORNING"],
    ["2026-10-06T13:59:59+07:00", "2026-10-06", "MORNING"],
    ["2026-10-06T14:00:00+07:00", "2026-10-06", "AFTERNOON"],
    ["2026-10-06T21:59:59+07:00", "2026-10-06", "AFTERNOON"],
    ["2026-10-06T22:00:00+07:00", "2026-10-06", "NIGHT"],
    ["2026-10-07T00:00:00+07:00", "2026-10-06", "NIGHT"],
    ["2027-01-01T02:00:00+07:00", "2026-12-31", "NIGHT"],
  ];
  for (const [at, date, shiftType] of cases) assert.deepEqual(currentGroundingSlot(new Date(at)), { date, shiftType });
});

test("Xác nhận ca hôm trước không hoàn thành ca hôm sau và không lấn biên ca kế tiếp", () => {
  const morning = { date: "2026-10-06", shiftType: "MORNING" as const };
  assert.equal(inspectionInGroundingSlot("2026-10-05T10:00:00+07:00", morning), false);
  assert.equal(inspectionInGroundingSlot("2026-10-06T06:00:00+07:00", morning), true);
  assert.equal(inspectionInGroundingSlot("2026-10-06T14:00:00+07:00", morning), false);
  const night = { date: "2026-10-06", shiftType: "NIGHT" as const };
  assert.equal(inspectionInGroundingSlot("2026-10-07T03:00:00+07:00", night), true);
  assert.equal(inspectionInGroundingSlot("2026-10-07T06:00:00+07:00", night), false);
  assert.equal(groundingSlotWindow(night).end.toISOString(), "2026-10-06T23:00:00.000Z");
});

test("Không nhận ngày không tồn tại, ngày nhập mơ hồ hoặc ca không hợp lệ", () => {
  assert.equal(requestedGroundingSlot({}), undefined);
  for (const input of [
    { inspectionDate: "2026-02-30", shiftType: "MORNING" },
    { inspectionDate: "06/10/2026", shiftType: "MORNING" },
    { inspectionDate: "2026-10-06", shiftType: "ALL" },
    { inspectionDate: "2026-10-06" },
  ]) assert.throws(() => requestedGroundingSlot(input));
});

test("Ca admin chỉ định được giữ cố định; phần tự động bù vào ca ít nhiệm vụ, mỗi vị trí chỉ một ca", () => {
  const rows = items(9).map((row, i) => ({ ...row, assignedShift: i < 4 ? "MORNING" : null }));
  const plan = assignGroundingShifts(rows);
  assert.ok(rows.slice(0, 4).every(row => plan.get(row.id)?.[0] === "MORNING"));
  assert.deepEqual(SHIFT_TYPE_ORDER.map(shift => rows.filter(row => plan.get(row.id)?.[0] === shift).length), [4, 3, 2]);
  assert.ok([...plan.values()].every(shifts => shifts.length === 1));
  const reversed = assignGroundingShifts([...rows].reverse());
  for (const row of rows) assert.deepEqual(plan.get(row.id), reversed.get(row.id));
});

test("Nhóm nhỏ và nhóm chỉ định hết không bị giao lặp; bỏ chỉ định trả về tuyến tự động", () => {
  const rows = items(2).map(row => ({ ...row, assignedShift: "AFTERNOON" }));
  const plan = assignGroundingShifts(rows);
  assert.ok(rows.every(row => plan.get(row.id)?.[0] === "AFTERNOON"));
  const automatic = assignGroundingShifts(rows.map(row => ({ ...row, assignedShift: null })));
  assert.deepEqual(rows.map(row => automatic.get(row.id)), [["MORNING"], ["AFTERNOON"]]);
  const single = { ...items(1)[0], assignedShift: "NIGHT" };
  assert.deepEqual(assignGroundingShifts([single]).get(single.id), ["NIGHT"]);
});
