import assert from "node:assert/strict";
import test from "node:test";
import { tagsInText } from "../lib/server/soot-blower-tree-defects";

const tags = (text: string) => [...tagsInText(text)].sort();

test("IKSL: tag mới IKSL-A1 / IKSL B6 trong nội dung phiếu", () => {
  assert.deepEqual(tags("Xử lý kẹt vòi IKSL-A1, IKSL B6 không tiến"), ["IKSL-A1", "IKSL-B6"]);
});

test("IKSL: phiếu còn ghi tên cũ IKSH-A1 (app dùng trước khi đổi) vẫn nhận ra vòi", () => {
  assert.deepEqual(tags("Kiểm tra vòi IKSH-A3 và IKSH B2"), ["IKSL-A3", "IKSL-B2"]);
});

test("IKSL: cách phiếu SYC hay viết — '#3 nhánh B', 'nhánh A số 2' khi có thổi bụi + SCR", () => {
  assert.deepEqual(tags("Kiểm tra và chỉnh lại áp suất vòi thổi bụi SCR #3 nhánh B (20HSF20AE003)"), ["IKSL-B3"]);
  assert.deepEqual(tags("Máy thổi bụi SCR nhánh A số 2 báo quá dòng"), ["IKSL-A2"]);
});

test("IKSL: cách hiện trường gọi 'IKSL' kèm nhánh (câu thật trên phiếu SYC)", () => {
  assert.deepEqual(tags("Xử lý IKSL05 nhánh A gãy đoạn ống lắp van xả áp (10HSF30AE005)"), ["IKSL-A5"]);
  assert.deepEqual(tags("Xử lý IKSL 01,06 (A) 10HSF30 AE001/006 bị lủng ống phía trong đường khói"), ["IKSL-A1", "IKSL-A6"]);
  assert.deepEqual(tags("Xử lý IKSL03 (10HSF20AE003) nhánh A gãy chốt gạt cần lẫy hơi"), ["IKSL-A3"]);
  assert.deepEqual(tags("kiểm tra, xử lý vòi thổi bụi IK SL 02 nhánh A bị lỗi điện"), ["IKSL-A2"]);
  assert.deepEqual(tags("Xứ lý vòi thổi bụi IKSL03 Nhánh B bị hư hỏng vòng bi con lăn 20HSF20AE003"), ["IKSL-B3"]);
  assert.deepEqual(tags("Xử lý xì chèn IK08 (10HCB31AT008), IKSL02, 04, 05 nhánh A và IKSL01, 03 nhánh B"),
    ["IK08", "IKSL-A2", "IKSL-A4", "IKSL-A5", "IKSL-B1", "IKSL-B3"]);
});

test("IKSL: không bắt nhầm phiếu SCR không phải vòi, hay 'nhánh A' ngoài ngữ cảnh thổi bụi SCR", () => {
  assert.deepEqual(tags("Xử lý tín hiệu dòng điện các vòi thổi bụi SCR DCS báo bad 10BJC11CE2,3"), []);
  assert.deepEqual(tags("Xử lý lủng đường ống cấp hơi thổi bụi SCR vách trái dưới IKSL06"), []);
  assert.deepEqual(tags("Bơm nhánh A số 2 hệ thống nước cấp rò"), []);
  assert.deepEqual(tags("IKSL12 cũ không còn trên sơ đồ"), []);
});

test("các loại vòi cũ vẫn khớp như trước", () => {
  assert.deepEqual(tags("VTB IK10 và IR 22,24 kẹt"), ["IK10", "IR22", "IR24"]);
});
