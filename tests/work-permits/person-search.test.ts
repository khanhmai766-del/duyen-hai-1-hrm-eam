import assert from "node:assert/strict";
import test from "node:test";
import { hasCommanderJobTitle, matchesPermitPersonText } from "../../lib/work-permit-person-search";

test("Chức vụ gợi ý CHTT nhận chữ hoa, không dấu và tên đầy đủ", () => {
  for (const title of ["CHTT", "Công nhân (CHTT đạt)", "Kỹ sư – CHTT", "chtt dat", "Chỉ huy trực tiếp", "CHỈ HUY TRỰC TIẾP (đạt)", "  Chỉ huy   trực tiếp  "]) {
    assert.equal(hasCommanderJobTitle(title), true, title);
  }
});

test("Không gợi ý đạt khi chức vụ phủ định, chờ xét, thu hồi hoặc chỉ chứa một phần chữ CHTT", () => {
  for (const title of ["", "Nhân viên", "CHTT chưa đạt", "Chưa đạt CHTT", "Không đạt CHTT", "CHTT (không đạt)",
    "CHTT chưa đủ điều kiện", "Chỉ huy trực tiếp chưa được công nhận", "Không phải CHTT", "CHTT chờ xét", "Dự kiến CHTT",
    "Đề xuất CHTT", "Đang học CHTT", "CHTT tạm dừng", "CHTT bị thu hồi", "CHTT hết hạn", "ABCCHTT", "CHTTXYZ"]) {
    assert.equal(hasCommanderJobTitle(title), false, title);
  }
});

test("Tìm chức vụ không dấu trên dữ liệu cũ, đồng thời giữ tìm tên, số thẻ và SĐT", () => {
  const person = { code: "A_01", name: "Đặng Văn Bình", phone: "0912345678", jobTitle: "Công nhân (CHTT đạt)" };
  for (const query of ["chtt dat", "CHTT ĐẠT", "cong nhan", "dang van binh", "A_01", "091234", ""]) {
    assert.equal(matchesPermitPersonText(person, query), true, query);
  }
  assert.equal(matchesPermitPersonText(person, "không đạt"), false);
  assert.equal(matchesPermitPersonText({ code: "HL-NAM", name: "Nam" }, "chtt"), false);
});
