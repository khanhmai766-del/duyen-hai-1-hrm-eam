import assert from "node:assert/strict";
import { test } from "node:test";
import { navSectionsForPosition, pathAllowedForPosition } from "../lib/nav";

test("cương vị Thống kê thấy riêng Chuẩn thể thức trong nhóm Tiện ích", () => {
  const utility = navSectionsForPosition("Thống kê").find((section) => section.title === "TIỆN ÍCH");
  assert.deepEqual(utility?.items.map((item) => item.href), ["/tien-ich/chuan-the-thuc"]);
  assert.equal(pathAllowedForPosition("/tien-ich/chuan-the-thuc", "Thống kê"), true);
  assert.equal(pathAllowedForPosition("/tien-ich/tien-do-dai-tu", "Thống kê"), false);
  assert.equal(pathAllowedForPosition("/defects", "Thống kê"), false);
});

test("cương vị khác giữ nguyên toàn bộ nhóm Tiện ích", () => {
  const utility = navSectionsForPosition("Trưởng ca").find((section) => section.title === "TIỆN ÍCH");
  assert.ok((utility?.items.length ?? 0) > 1);
});
