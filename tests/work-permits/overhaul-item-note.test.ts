import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionItemProgress } from "../../lib/server/work-permit-overhaul";
import { OVERHAUL_ITEM_NOTE_MAX, type OverhaulItemSnapshot } from "../../lib/work-permit-overhaul";

const item = { code: "11.2.1.1", sheet: "Tuabin", source: "S1", name: "Bơm nước ngưng" } as unknown as OverhaulItemSnapshot;
const noteOf = (note: string) => parseSessionItemProgress([{ code: item.code, sheet: item.sheet, source: item.source, done: true, percent: 69, note }], [item], new Map()).items[0].note;

test("Ghi chú hạng mục giữ đủ nội dung dài hơn mốc cũ 1.000 ký tự", () => {
  const note = "x".repeat(OVERHAUL_ITEM_NOTE_MAX);
  assert.equal(noteOf(note), note);
});

test("Ghi chú hạng mục không vượt trần", () => {
  assert.equal(noteOf("x".repeat(OVERHAUL_ITEM_NOTE_MAX + 50)).length, OVERHAUL_ITEM_NOTE_MAX);
});
