import assert from "node:assert/strict";
import test from "node:test";
import { pickNamedCardHolder } from "../../lib/server/work-permit-people";

const person = (code: string, name: string, isActive = true) => ({ code, name, isActive });

test("QR họ tên khớp người đã có thẻ dù khác dấu/hoa thường; bỏ qua mã tạm HL-…", () => {
  const found = pickNamedCardHolder([person("HL-PHAM-DINH-LA", "Phạm đình la"), person("SGIDC/04", "Phạm Đình La")], "PHẠM  ĐÌNH LA");
  assert.equal(found?.code, "SGIDC/04");
});

test("searchText khớp cả tên dài hơn: chỉ nhận người trùng NGUYÊN họ tên", () => {
  assert.equal(pickNamedCardHolder([person("SGIDC/09", "Nguyễn Tiến Sỹ Anh")], "Nguyễn Tiến Sỹ"), null);
});

test("hai người cùng tên đang hoạt động: không đoán", () => {
  assert.equal(pickNamedCardHolder([person("A/01", "Trần Văn Quang"), person("B/02", "Trần Văn Quang")], "Trần Văn Quang"), null);
});

test("ưu tiên người đang hoạt động; chỉ toàn hồ sơ ngừng hoạt động thì nhận khi duy nhất", () => {
  assert.equal(pickNamedCardHolder([person("A/01", "Lê Văn A", false), person("B/02", "Lê Văn A")], "Lê Văn A")?.code, "B/02");
  assert.equal(pickNamedCardHolder([person("A/01", "Lê Văn A", false)], "Lê Văn A")?.code, "A/01");
  assert.equal(pickNamedCardHolder([], "Lê Văn A"), null);
});
