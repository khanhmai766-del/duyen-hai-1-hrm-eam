import test from "node:test";
import assert from "node:assert/strict";
import { elapsedDaysInPeriod, listBcsxMissing, listMissingWaterShifts, listMonthlyMissing } from "../../../modules/ctktkt/lib/data-completeness.ts";
import { SHIFT_TIME_SLOTS } from "../../../modules/ctktkt/lib/bcsx.ts";

test("monthly completeness checks only elapsed operating days and preserves zero", () => {
  const rows = [{ B: "0", C: "" }, { B: "2" }];
  const missing = listMonthlyMissing(rows, "2026-10", "2026-10-02", [
    { code: "B", label: "Đầu cực S1" },
    { code: "C", label: "Điểm bán S1" },
  ]);
  assert.deepEqual(missing.map(item => item.key), ["1:C", "2:C"]);
  assert.equal(elapsedDaysInPeriod("2026-11", "2026-10-31"), 0);
});

test("BCSX completeness reports the exact unit metric and time slot", () => {
  const full = () => ({ P: SHIFT_TIME_SLOTS.map(() => "1"), Q: SHIFT_TIME_SLOTS.map(() => "1"), D: SHIFT_TIME_SLOTS.map(() => "1"), E: SHIFT_TIME_SLOTS.map(() => "1") });
  const grids = { S1: full(), S2: full() };
  grids.S2.Q[3] = "";
  const missing = listBcsxMissing(grids);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].key, `S2:Q:${SHIFT_TIME_SLOTS[3]}`);
});

test("water completeness lists absent shifts through the operating date", () => {
  const shifts = [
    { logDate: "2026-10-01", shiftTime: "06h00" },
    { logDate: "2026-10-01", shiftTime: "14h00" },
  ];
  const missing = listMissingWaterShifts(shifts, "2026-10", "2026-10-01");
  assert.deepEqual(missing.map(item => item.key), ["2026-10-01:22h00"]);
});
