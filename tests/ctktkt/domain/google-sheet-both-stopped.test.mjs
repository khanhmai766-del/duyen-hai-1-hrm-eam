import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleSheetDayPayload } from "../../../modules/ctktkt/lib/google-sheet-sync.ts";

const entries = (overrides = {}) => Object.entries({
  B: "0", C: "0", F: "0", H: "0", I: "0", L: "0", AE: "0", AF: "0", AE_ADJ: "0", AF_ADJ: "0",
  PPA_CSKD_S1: "0", PPA_CSKD_S2: "0", ...overrides,
}).map(([fieldCode, value]) => ({ fieldCode, value }));
const ppa = { ppaPlant: "0", ppaS1: "0", ppaS2: "0", noteS1: "", noteS2: "" };

test("cả hai tổ cùng ngừng (như 01/11/2026): vẫn đẩy được, nhiệt trị để trống, đánh giá ngừng máy", () => {
  const payload = buildGoogleSheetDayPayload("2026-11-01", entries(), ppa);
  for (const unit of ["S1", "S2", "NMND"]) {
    assert.equal(payload[unit].sanLuong, 0);
    assert.equal(payload[unit].nhietTri, null);
    assert.equal(payload[unit].shnThucTe, null);
    assert.equal(payload[unit].shnPPA, null);
    assert.equal(payload[unit].chenhLech, "");
    assert.match(payload[unit].danhGia, /^Ngừng máy — không đánh giá/);
  }
});

test("một tổ có phát điện hoặc đốt than mà thiếu nhiệt trị thì vẫn chặn như cũ", () => {
  assert.throws(
    () => buildGoogleSheetDayPayload("2026-11-02", entries({ B: "8.34176", C: "7.7", F: "14", AE: "4422", AE_ADJ: "4422", PPA_CSKD_S1: "622.5" }), { ...ppa, ppaPlant: "10327", ppaS1: "10327" }),
    /Nhiệt trị/,
  );
  // Không phát điện nhưng có đốt than (khởi động) cũng phải có nhiệt trị.
  assert.throws(() => buildGoogleSheetDayPayload("2026-11-01", entries({ AE: "120", AE_ADJ: "120" }), ppa), /Nhiệt trị/);
});

test("ngày bình thường giữ nguyên cách tính suất hao nhiệt", () => {
  const payload = buildGoogleSheetDayPayload("2026-11-07", entries({
    B: "14.60972", C: "13.570647", F: "24", AE: "7524.1", AE_ADJ: "7524.1", AJ: "19650.5249261901", PPA_CSKD_S1: "622.5",
  }), { ...ppa, ppaPlant: "10233.26", ppaS1: "10233.26" });
  assert.ok(Math.abs(payload.S1.shnThucTe - 7524.1 * 19650.5249261901 / 13.570647 / 1000) < 1e-9);
  assert.equal(payload.S1.nhietTri, 19650.5249261901);
  assert.match(payload.S1.danhGia, /^Không đạt PPA/);
});
