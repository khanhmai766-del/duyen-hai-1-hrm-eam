import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAuxiliaryElectricity } from "../../../modules/ctktkt/lib/auxiliary-electricity.ts";

test("auxiliary electricity adds grid receipt only to total MWh", () => {
  const result = calculateAuxiliaryElectricity(100, 90, 5);
  assert.deepEqual(result, {
    internalMwh: 10,
    gridReceivedMwh: 5,
    totalMwh: 15,
    percent: 10,
  });
});

test("stopped unit reports received grid electricity while percentage stays unavailable", () => {
  const result = calculateAuxiliaryElectricity(0, 0, 173.145);
  assert.equal(result.totalMwh, 173.145);
  assert.equal(result.percent, null);
});

test("missing production does not turn grid receipt into a fabricated total", () => {
  const result = calculateAuxiliaryElectricity(null, null, 5);
  assert.equal(result.totalMwh, null);
  assert.equal(result.percent, null);
});
