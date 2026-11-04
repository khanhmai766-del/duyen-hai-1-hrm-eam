import test from "node:test";
import assert from "node:assert/strict";
import { calculateOperatingHours, operatingHoursIncrement } from "../../../modules/ctktkt/lib/ctktkt-operating-hours.ts";

test("daily increment follows QLKT hours and assigns plant-level fault hours to the stopped unit", () => {
  // 21/09/2026: S1 trips after 9.93 h, QLKT fault total 14.07 h (matches the source workbook).
  const day = operatingHoursIncrement({ F: "9.93", L: "24", CS: "0", CT: "14.07", CU: "0" });
  assert.equal(day.W68, 9.93);
  assert.equal(day.W69, 24);
  assert.equal(day.Y68, 14.07);
  assert.equal(day.Y69, 0);
});

test("both units short of 24 h share the plant totals by idle hours", () => {
  const day = operatingHoursIncrement({ F: "18", L: "12", CS: "0", CT: "0", CU: "18" });
  assert.equal(day.X68, 6);
  assert.equal(day.X69, 12);
});

test("cumulative totals start on 01/01/2026 and report days missing QLKT hours", () => {
  const daily = new Map([
    ["2026-01-01", { F: "24", L: "24" }],
    ["2026-01-03", { F: "0", L: "24", CT: "24" }],
  ]);
  const result = calculateOperatingHours(daily, "2026-01-03");
  assert.deepEqual(result.missingDates, ["2026-01-02"]);
  const total = result.byDate.get("2026-01-03");
  assert.equal(total.W68, 24);
  assert.equal(total.W69, 48);
  assert.equal(total.Y68, 24);
  assert.equal(result.byDate.get("2026-01-02").W68, 24);
});
