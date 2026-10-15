import assert from "node:assert/strict";
import test from "node:test";
import { peopleRowsFromValues } from "../../lib/server/work-permit-people-sync";

// Đọc bảng thẻ bằng Sheets API (16/10/2026): cùng cột + điều kiện với web app Apps Script cũ.
const header = ["STT", "Kết quả huấn luyện", "Họ tên:", "Năm sinh:", "Số điện thoại:", "Đơn vị:", "Gói thầu:", "Chức vụ:", "Vị trí làm việc:", "Khu vực làm việc:", "Ngày huấn luyện an toàn", "Số thẻ ra vào cổng", "Ngày cấp thẻ", "Ngày thẻ hết hạn", "Hình ảnh"];
const person = ["1", "ĐÃ HUẤN LUYỆN ATVSLĐ", "Trần Thị Thanh Trúc", "1992", "0907159986", "Liên Danh TEE", "17HH-SCL-2026", "QA/QC", "Lò hơi", "S2-NMNĐ DH1", "28/09/2026", "TEE/01", "29/09/2026", "31/12/2026"];

test("bỏ hàng trống / tiêu đề; lấy đúng cột B…O", () => {
  const rows = peopleRowsFromValues("TEE", [[], header, person]);
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, { sheet: "TEE", ketQuaHL: "ĐÃ HUẤN LUYỆN ATVSLĐ", hoTen: "Trần Thị Thanh Trúc", namSinh: "1992", sdt: "0907159986", donVi: "Liên Danh TEE",
    goiThau: "17HH-SCL-2026", chucVu: "QA/QC", viTri: "Lò hơi", khuVuc: "S2-NMNĐ DH1", ngayHL: "28/09/2026", soThe: "TEE/01", ngayCap: "29/09/2026", ngayHetHan: "31/12/2026", photo: "" });
});

test("cần họ tên VÀ (ngày huấn luyện hoặc số thẻ); ảnh chỉ nhận link", () => {
  const noCard = [...person]; noCard[11] = "";
  const nothing = [...person]; nothing[10] = ""; nothing[11] = "";
  const linked = [...person, "https://drive.google.com/file/d/abc/view"];
  const rows = peopleRowsFromValues("TEE", [noCard, nothing, linked]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].soThe, "");
  assert.equal(rows[1].photo, "https://drive.google.com/file/d/abc/view");
});
