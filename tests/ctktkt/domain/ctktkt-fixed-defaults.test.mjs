import test from "node:test";
import assert from "node:assert/strict";
import { applyCtktktFixedValue } from "../../../modules/ctktkt/lib/ctktkt-defaults.ts";
import { normalizeCtktktInputValue } from "../../../modules/ctktkt/lib/ctktkt-extra-fields.ts";

test("installed capacity C181 is always fixed at 1245 MW", () => {
  assert.equal(applyCtktktFixedValue("C181", ""), "1245");
  assert.equal(applyCtktktFixedValue("C181", "1 245"), "1245");
  assert.equal(applyCtktktFixedValue("D181", "20,5"), "20,5");
});

test("CTKTKT numeric values accept workbook thousands spaces", () => {
  assert.equal(normalizeCtktktInputValue("C181", "1 245"), "1245");
  assert.equal(normalizeCtktktInputValue("D181", "20,4947"), "20.4947");
});
