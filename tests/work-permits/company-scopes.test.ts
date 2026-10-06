import assert from "node:assert/strict";
import test from "node:test";
import { companyAllowsScope, companyScopeLabel, companyUnclassified } from "../../lib/work-permits";

const company = (sctx: boolean, overhaul: boolean) => ({ sctx, overhaul });

test("Chưa phân loại → chọn được ở cả hai nhóm", () => {
  assert.equal(companyUnclassified(company(false, false)), true);
  assert.equal(companyAllowsScope(company(false, false), "SCTX"), true);
  assert.equal(companyAllowsScope(company(false, false), "OVERHAUL"), true);
  assert.equal(companyScopeLabel(company(false, false)), "Chưa phân loại");
});

test("Đã phân loại → chỉ nhóm đã tick", () => {
  assert.equal(companyAllowsScope(company(true, false), "SCTX"), true);
  assert.equal(companyAllowsScope(company(true, false), "OVERHAUL"), false);
  assert.equal(companyAllowsScope(company(false, true), "SCTX"), false);
  assert.equal(companyAllowsScope(company(false, true), "OVERHAUL"), true);
});

test("Cả hai → chọn được ở cả hai nhóm, nhãn gộp", () => {
  assert.equal(companyAllowsScope(company(true, true), "SCTX"), true);
  assert.equal(companyAllowsScope(company(true, true), "OVERHAUL"), true);
  assert.equal(companyScopeLabel(company(true, true)), "SCTX + Đại tu");
});

test("Thiếu thông tin đơn vị hoặc nhóm phiếu → không chặn", () => {
  assert.equal(companyAllowsScope(null, "SCTX"), true);
  assert.equal(companyAllowsScope(undefined, "OVERHAUL"), true);
  assert.equal(companyAllowsScope(company(false, true), null), true);
});
