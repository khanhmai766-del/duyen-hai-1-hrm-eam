import assert from "node:assert/strict";
import test from "node:test";
import { nkvhPctUrl, parseNkvhPctLink, parseNkvhLinkUpdate } from "../../lib/nkvh-pct";

const id = "21c6a1d6-5e7c-41ad-ae4a-5b91ab934b6d";
test("cập nhật link chỉ nhận UUID và phiên bản, cho phép gỡ", () => {
  assert.deepEqual(parseNkvhLinkUpdate({ version: 2, nkvhPctId: id.toUpperCase() }), { version: 2, nkvhPctId: id });
  assert.deepEqual(parseNkvhLinkUpdate({ version: 2, nkvhPctId: null }), { version: 2, nkvhPctId: null });
});
test("không dùng cập nhật link để sửa thông tin cấp phiếu", () => {
  for (const key of ["number", "kind", "status", "issuerName", "authorizerName", "defectId", "content"]) {
    assert.throws(() => parseNkvhLinkUpdate({ version: 2, nkvhPctId: id, [key]: "sửa trái phép" }));
  }
});
test("cập nhật link không nhận thiếu ID, ID sai hoặc phiên bản không hợp lệ", () => {
  for (const body of [{ version: 1 }, { version: 1, nkvhPctId: "123" }, { version: "1", nkvhPctId: id }, { version: 0, nkvhPctId: id }, { version: 1.5, nkvhPctId: id }]) assert.throws(() => parseNkvhLinkUpdate(body));
});
test("ghép và tách link chi tiết Cơ/Điện, chỉ giữ UUID", () => {
  for (const kind of ["MECHANICAL", "ELECTRICAL"]) {
    const url = nkvhPctUrl(kind, id);
    assert.equal(parseNkvhPctLink(url, kind), id);
    assert.equal(parseNkvhPctLink(url.replace("http:", "https:"), kind), id);
    assert.equal(new URL(url).searchParams.get("id_pct"), id);
  }
});
test("không có UUID thì chỉ mở danh sách", () => {
  assert.equal(new URL(nkvhPctUrl("MECHANICAL")).pathname, "/nkvh/pages/pct/pctc");
  assert.equal(new URL(nkvhPctUrl("ELECTRICAL")).pathname, "/nkvh/pages/pct/pctd");
  assert.equal(parseNkvhPctLink("  ", "MECHANICAL"), null);
});
test("không nhận link khác host, khác loại, thiếu ID hoặc ID lặp", () => {
  const url = nkvhPctUrl("MECHANICAL", id);
  for (const bad of [url.replace("nkvh.tpcduyenhai.com.vn", "example.com"), url.replace("pctc_ct", "pctd_ct"), nkvhPctUrl("MECHANICAL"), url.replace(id, "123"), `${url}&id_pct=${id}`, url.replace("http:", "javascript:"), url.replace("http://", "http://user:pass@")]) {
    assert.throws(() => parseNkvhPctLink(bad, "MECHANICAL"));
  }
});
