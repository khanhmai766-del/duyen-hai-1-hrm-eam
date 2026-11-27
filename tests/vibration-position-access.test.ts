// Chạy: npx tsx --test tests/vibration-position-access.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { VIBRATION_AREA_MAP, vibrationAccessFor } from "../lib/vibration/position-access";

const pos = (position?: string, extra: Record<string, string> = {}) => ({ role: "TECHNICIAN", position, ...extra });
const edit = (p: string) => vibrationAccessFor(pos(p)).editAreas;

test("mỗi cương vị vận hành chỉ nhập đúng thiết bị của mình", () => {
  assert.deepEqual(edit("Lò phó S1"), ["Lò phó S1"]);
  assert.deepEqual(edit("Lò phó S2"), ["Lò phó S2"]);
  assert.deepEqual(edit("Máy phó S1"), ["Máy phó S1"]);
  assert.deepEqual(edit("Trợ thủ S2"), ["Trợ thủ S2"]);
  assert.deepEqual(edit("Máy nghiền S1"), ["Máy nghiền S1"]);
  assert.deepEqual(edit("14. Máy nghiền S2"), ["Máy nghiền S2"]);
  assert.deepEqual(edit("ESP S2"), ["ESP S2"]);
  assert.deepEqual(edit("VHV FGD S1"), ["FGD S1"]);
  assert.deepEqual(edit("Thải xỉ S1"), ["Thải xỉ"]);
  assert.deepEqual(edit("Thải xỉ"), ["Thải xỉ"]);
  assert.deepEqual(edit("Trạm bơm tuần hoàn"), ["Trạm bơm tuần hoàn"]);
  assert.deepEqual(edit("Khí nén - Nhà dầu"), ["Khí nén - nhà dầu 300m3"]);
  assert.deepEqual(edit("XLN hỗn hợp"), ["XLN hỗn hợp"]);
  assert.deepEqual(edit("XLNT"), ["XLNT - Nhà dầu 5000m3"]);
  assert.deepEqual(edit("NH3 - Lò hơi phụ"), ["NH3 - Lò hơi phụ"]);
  assert.deepEqual(edit("Trực chính điện"), ["Trực chính điện"]);
  assert.deepEqual(edit("Trực phụ điện S2"), ["Trực phụ điện"]);
  assert.deepEqual(edit("Trạm bơm nước thô"), ["Trạm nước thô"]);
});

test("không ghi unit thì khớp cả hai tổ máy; ghi unit thì chỉ tổ máy đó", () => {
  assert.deepEqual(edit("Lò phó"), ["Lò phó S1", "Lò phó S2"]);
  assert.deepEqual(edit("Máy nghiền S2"), ["Máy nghiền S2"]);
});

test("mọi khu vực trong bảng ánh xạ đều có cương vị tương ứng", () => {
  for (const m of VIBRATION_AREA_MAP) {
    const label = m.unit ? `${m.area}` : m.area; // area tự nó là bí danh hợp lệ trong danh mục
    assert.ok(edit(label).includes(m.area), `${m.area} không tự khớp`);
  }
});

test("cương vị khác không nhập được thiết bị ngoài mình", () => {
  assert.ok(!edit("Lò phó S1").includes("Lò phó S2"));
  assert.ok(!edit("Thiết bị đo lường điều khiển").length);
  assert.deepEqual(edit("Lò trưởng S1"), []);
  assert.deepEqual(edit("Máy trưởng S2"), []);
});

test("vị trí giám sát xem tất cả, không nhập", () => {
  for (const p of ["Trưởng ca", "TK Lò máy", "Trưởng kíp Lò - Máy", "Trưởng kíp điện", "TKĐ", "Quản đốc", "Quản đốc phân xưởng", "Phó quản đốc", "Kỹ thuật viên", "KTV", "PQĐ", "QĐ", "Kỹ sư"]) {
    const a = vibrationAccessFor(pos(p));
    assert.equal(a.viewAll, true, p);
    assert.equal(a.supervisor, true, p);
    assert.deepEqual(a.editAreas, [], p);
    assert.equal(a.declared, true, p);
  }
});

test("Kỹ thuật viên I&C là cương vị vận hành chứ không phải giám sát", () => {
  const a = vibrationAccessFor(pos("Kỹ thuật viên I&C"));
  assert.equal(a.viewAll, false);
});

test("giám sát kiêm cương vị vận hành vẫn nhập được cương vị đó (như app cũ)", () => {
  const a = vibrationAccessFor(pos("Trưởng ca", { secondaryPosition: "Lò phó S1" }));
  assert.equal(a.viewAll, true);
  assert.deepEqual(a.editAreas, ["Lò phó S1"]);
});

test("dùng cả cương vị chính, phụ, hiện tại", () => {
  const a = vibrationAccessFor({ role: "TECHNICIAN", primaryPosition: "ESP S1", secondaryPosition: "Máy phó S2", secondaryPosition2: "XLNT", currentPosition: "ESP S1" });
  assert.deepEqual(a.editAreas, ["Máy phó S2", "ESP S1", "XLNT - Nhà dầu 5000m3"].sort((x, y) => VIBRATION_AREA_MAP.findIndex((m) => m.area === x) - VIBRATION_AREA_MAP.findIndex((m) => m.area === y)));
});

test("admin: mọi quyền; không cương vị: chưa gán", () => {
  const admin = vibrationAccessFor({ role: "ADMIN" });
  assert.equal(admin.admin, true);
  assert.equal(admin.viewAll, true);
  const none = vibrationAccessFor({ role: "TECHNICIAN" });
  assert.deepEqual(none, { admin: false, viewAll: false, editAreas: [], declared: false, supervisor: false, catalogEditor: false });
  assert.equal(vibrationAccessFor(null).declared, false);
  const office = vibrationAccessFor(pos("Nhân viên văn phòng"));
  assert.deepEqual(office.editAreas, []);
  assert.equal(office.viewAll, false);
});

test("chức danh KTV được sửa danh mục / cấu hình / phân tích, không nhập số đo; KTV I&C và giám sát khác thì không", () => {
  for (const p of ["KTV", "Kỹ thuật viên", "Kỹ thuật viên vận hành"]) {
    const a = vibrationAccessFor(pos(p));
    assert.equal(a.catalogEditor, true, p);
    assert.deepEqual(a.editAreas, [], p);
  }
  for (const p of ["Kỹ thuật viên I&C", "Trưởng ca", "TK Lò máy", "Lò phó S1"]) assert.equal(vibrationAccessFor(pos(p)).catalogEditor, false, p);
});
