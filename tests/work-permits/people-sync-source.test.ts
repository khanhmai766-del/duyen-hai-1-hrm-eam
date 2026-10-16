import assert from "node:assert/strict";
import test from "node:test";
import { cardConflict, newPersonScope, parsePeopleSyncSource, sheetCardCode } from "../../lib/server/work-permit-people-sync";

// Bảng SCTX (14/10/2026) đánh lại SGIDC/01–14 trùng 14 người Đại tu → không được ghi đè hồ sơ người khác.
const row = { name: "Phẩm Đình Tứ", code: "SGIDC/01", tab: "IDC" };

test("số thẻ đã là của người khác bên nhóm kia: báo xung đột, không ghi đè", () => {
  const message = cardConflict({ name: "Lê Anh Tuấn", scope: "OVERHAUL" }, row, "SCTX");
  assert.ok(message);
  assert.match(message!, /SGIDC\/01/); assert.match(message!, /Lê Anh Tuấn/); assert.match(message!, /nhóm Đại tu/); assert.match(message!, /bảng SCTX/);
});

test("cùng người (trùng họ tên, khác dấu/hoa thường) bên nhóm kia: cập nhật bình thường", () => {
  assert.equal(cardConflict({ name: "PHẨM ĐÌNH TỨ", scope: "OVERHAUL" }, row, "SCTX"), null);
});

test("cùng nhóm hoặc chưa có hồ sơ: không phải xung đột (sửa họ tên trên chính bảng nguồn vẫn cập nhật)", () => {
  assert.equal(cardConflict({ name: "Tên cũ", scope: "SCTX" }, row, "SCTX"), null);
  assert.equal(cardConflict(undefined, row, "SCTX"), null);
  assert.equal(cardConflict({ name: "Lê Anh Tuấn", scope: null }, row, "SCTX"), null);
});

test("nguồn mặc định là Đại tu; nguồn lạ bị từ chối", () => {
  assert.equal(parsePeopleSyncSource(undefined), "OVERHAUL");
  assert.equal(parsePeopleSyncSource("SCTX"), "SCTX");
  assert.throws(() => parsePeopleSyncSource("ABC"), (error: unknown) => error instanceof Response && error.status === 400);
});

test("đơn vị chỉ tick Đầu tư (NARIME trong bảng Đại tu): người mới vào nhóm Đầu tư", () => {
  assert.equal(newPersonScope({ sctx: false, overhaul: false, investment: true }, "OVERHAUL"), "INVESTMENT");
  assert.equal(newPersonScope({ sctx: false, overhaul: true, investment: true }, "OVERHAUL"), "OVERHAUL");
  assert.equal(newPersonScope({ sctx: false, overhaul: true, investment: false }, "OVERHAUL"), "OVERHAUL");
  assert.equal(newPersonScope(undefined, "SCTX"), "SCTX");
});

test("người đã ở nhóm Đầu tư của đơn vị Đầu tư: cập nhật bình thường, không báo xung đột", () => {
  assert.equal(cardConflict({ name: "Tên khác", scope: "INVESTMENT" }, row, "OVERHAUL", "INVESTMENT"), null);
  assert.match(cardConflict({ name: "Tên khác", scope: "INVESTMENT" }, row, "OVERHAUL")!, /nhóm Đầu tư/);
});

test("bảng SCTX: nhóm SCTX gắn /SXKD, đơn vị Đầu tư (NARIME) giữ số in trên thẻ; bảng Đại tu không gắn", () => {
  assert.equal(sheetCardCode("SGIDC/01", "SCTX", "SCTX"), "SGIDC/01/SXKD");
  assert.equal(sheetCardCode("SGIDC/01/SXKD", "SCTX", "SCTX"), "SGIDC/01/SXKD");
  assert.equal(sheetCardCode("NARIME/21", "SCTX", newPersonScope({ sctx: false, overhaul: false, investment: true }, "SCTX")), "NARIME/21");
  assert.equal(sheetCardCode("NARIME/21", "OVERHAUL", "INVESTMENT"), "NARIME/21");
  assert.equal(sheetCardCode("", "SCTX", "SCTX"), "");
});
