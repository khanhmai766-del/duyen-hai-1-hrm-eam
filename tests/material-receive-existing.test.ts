import test from "node:test";
import assert from "node:assert/strict";
import { existingReceiptEditError } from "../lib/material-receive-existing";

const edit = (quantity: number, available = 0) => existingReceiptEditError({
  quantity, previous: 5, used: 5, available, unit: "Lít",
});

test("sửa số lãnh Hiện có sau khi đã dùng hết vẫn giữ được số cũ", () => {
  assert.equal(edit(5), null);
  assert.match(edit(4) ?? "", /đã sử dụng/);
  assert.match(edit(6) ?? "", /Không đủ vật tư Hiện có/);
  assert.equal(edit(6, 1), null);
});

test("số lãnh sửa phải là số nguyên dương", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.match(edit(value) ?? "", /số nguyên lớn hơn 0/);
  }
});
