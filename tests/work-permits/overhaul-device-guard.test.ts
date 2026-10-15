import assert from "node:assert/strict";
import test from "node:test";
import { OVERHAUL_CODE_PATTERN, sameOverhaulDevice } from "../../lib/work-permit-overhaul";

// Ca thật 15/10/2026: tab Trợ thủ-Cơ bị dán đè nhóm bồn dầu chèn lên mã 10.1.6–10.1.9.
test("thiết bị khác hẳn: không phải một (mã bị dùng lại)", () => {
  assert.equal(sameOverhaulDevice("Bình gia nhiệt hạ áp số 7A/7B, 8A/8B", "Bồn dầu chân không dầu chèn máy phát"), false);
  assert.equal(sameOverhaulDevice("Van an toàn bình gia nhiệt số 1, 2, 3, 5, 6", "Bồn dâu phao"), false);
  assert.equal(sameOverhaulDevice("Van an toàn bình khử khí", "Bồn dầu chặn"), false);
});

test("sửa chính tả, dấu, hoa thường hoặc thêm bớt vài chữ: vẫn là một", () => {
  assert.equal(sameOverhaulDevice("Bồn dâu phao", "Bồn dầu phao"), true);
  assert.equal(sameOverhaulDevice("BÌNH GIA NHIỆT HẠ ÁP SỐ 7A/7B", "Bình gia nhiệt hạ áp số 7A/7B, 8A/8B"), true);
  assert.equal(sameOverhaulDevice("Van an toàn bình gia nhiệt số 1, 2, 3", "Van an toàn bình gia nhiệt số 1, 2, 3, 5, 6"), true);
  assert.equal(sameOverhaulDevice("", "Bất kỳ"), true);
});

test("mã hạng mục nhận hậu tố .MF (thiết bị máy phát trong file Turbine), tiền tố MF. cũ và PS. (phát sinh)", () => {
  for (const code of ["8.2.2.4", "9.2.2.8.MF", "10.1.6.MF", "MF.8.2.2.4", "PS.1.3"]) assert.ok(OVERHAUL_CODE_PATTERN.test(code), code);
  for (const code of ["MF8.2.2.4", "8.2.2.4MF", "8.2.2.4.MF.1", "XX.1.2", "MF.", ".MF", "Nhật ký ngày"]) assert.ok(!OVERHAUL_CODE_PATTERN.test(code), code);
});
