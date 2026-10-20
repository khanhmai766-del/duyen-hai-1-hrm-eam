import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPcccPage } from "../../lib/pccc-pagination";

function load(total: number, query: string) {
  const rows = Array.from({ length: total }, (_, index) => index + 1);
  return loadPcccPage(
    new URLSearchParams(query),
    async () => rows.length,
    async ({ skip, take }) => rows.slice(skip, skip + take)
  );
}

test("Máy nghiền S1: trang 2 của 30 bình vẫn hợp lệ; 11 tủ/cuộn vòi phải về trang 1", async () => {
  const extinguishers = await load(30, "page=2&pageSize=25");
  assert.equal(extinguishers.page, 2);
  assert.deepEqual(extinguishers.rows, [26, 27, 28, 29, 30]);
  const cabinets = await load(11, "page=2&pageSize=25");
  assert.equal(cabinets.page, 1);
  assert.equal(cabinets.pageCount, 1);
  assert.equal(cabinets.total, 11);
  assert.equal(cabinets.rows.length, 11);
});

test("Trang vượt giới hạn trả trang cuối có dữ liệu, kể cả khi bộ lọc thu hẹp kết quả", async () => {
  const result = await load(51, "page=999&pageSize=25");
  assert.equal(result.page, 3);
  assert.equal(result.pageCount, 3);
  assert.deepEqual(result.rows, [51]);
});

test("Phạm vi không có thiết bị vẫn trả rỗng và trang 1", async () => {
  const result = await load(0, "page=99&pageSize=25");
  assert.equal(result.total, 0);
  assert.equal(result.page, 1);
  assert.equal(result.pageCount, 1);
  assert.deepEqual(result.rows, []);
});

test("Tham số không hợp lệ không tạo skip/take âm, NaN hay số thập phân", async () => {
  for (const value of ["0", "-1", "NaN", "Infinity", "abc", ""]) {
    const result = await load(30, `page=${value}&pageSize=${value}`);
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 25);
    assert.equal(result.rows.length, 25);
  }
  const fraction = await load(60, "page=2.9&pageSize=25.9");
  assert.equal(fraction.page, 2);
  assert.equal(fraction.pageSize, 25);
  assert.equal(fraction.rows[0], 26);
  assert.equal((await load(300, "pageSize=9999")).rows.length, 200);
});

test("Lỗi đếm dữ liệu được giữ nguyên, không bị biến thành danh sách rỗng", async () => {
  await assert.rejects(loadPcccPage(new URLSearchParams(), async () => {
    throw new Error("Không đọc được dữ liệu");
  }, async () => assert.fail("Không truy vấn dòng khi chưa đếm được")), /Không đọc được dữ liệu/);
});
