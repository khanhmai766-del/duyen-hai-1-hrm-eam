import assert from "node:assert/strict";
import test from "node:test";
import { groupSpreadsheetCells, normalizeSpreadsheetValue, parseSpreadsheetClipboard } from "../../../modules/ctktkt/lib/spreadsheet-grid.ts";

test("chuẩn hóa số Việt Nam khi dán từ Excel nhưng giữ nguyên văn bản", () => {
  assert.equal(normalizeSpreadsheetValue("1.617.408,5"), "1617408.5");
  assert.equal(normalizeSpreadsheetValue("20.021,59"), "20021.59");
  assert.equal(normalizeSpreadsheetValue("1,617,408.5"), "1617408.5");
  assert.equal(normalizeSpreadsheetValue("0,10"), "0.10");
  assert.equal(normalizeSpreadsheetValue("Đạt"), "Đạt");
  assert.equal(normalizeSpreadsheetValue("—"), "");
});

test("đọc đúng ma trận nhiều hàng nhiều cột từ clipboard Excel", () => {
  assert.deepEqual(parseSpreadsheetClipboard("1\t2\t3\r\n4\t5\t6\r\n"), [
    ["1", "2", "3"],
    ["4", "5", "6"],
  ]);
});

test("tự bỏ cột nhãn khi người dùng copy cả tên chỉ tiêu", () => {
  assert.deepEqual(parseSpreadsheetClipboard("P TD 21\t0,1\t0,2\nQ TD 21\t0,3\t0,4"), [
    ["0.1", "0.2"],
    ["0.3", "0.4"],
  ]);
});

test("gom ô theo tọa độ hiển thị để dùng chung phím mũi tên trên mọi bảng", () => {
  const rows = groupSpreadsheetCells([
    { item: "B2", top: 51, left: 220 },
    { item: "A1", top: 10, left: 100 },
    { item: "B1", top: 13, left: 220 },
    { item: "A2", top: 49, left: 100 },
  ]);
  assert.deepEqual(rows.map(row => row.map(cell => cell.item)), [["A1", "B1"], ["A2", "B2"]]);
});

test("dán từ Excel lấy giá trị gốc x:num thay cho số đang hiển thị 1 chữ số thập phân", () => {
  const html = `<html><body><table><tr><td class=xl65 x:num="8.2567">8,3</td><td x:num>5000</td></tr>
<tr><td class=xl65 x:num="9.0449999999999999">9,0</td><td class=xl66 x:num="4012.375">4.012</td></tr></table></body></html>`;
  assert.deepEqual(parseSpreadsheetClipboard("8,3\t5000\r\n9,0\t4.012\r\n", html), [
    ["8.2567", "5000"],
    ["9.045", "4012.375"],
  ]);
});

test("dán từ Google Sheets lấy giá trị gốc trong data-sheets-value", () => {
  const html = `<google-sheets-html-origin><table><tbody><tr><td data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:8.2567}">8.3</td></tr></tbody></table>`;
  assert.deepEqual(parseSpreadsheetClipboard("8.3", html), [["8.2567"]]);
});

test("không thay giá trị khi ô là ngày, văn bản hoặc HTML lệch bố cục", () => {
  const dateHtml = `<table><tr><td x:num="46333">07/11/2026</td><td x:str>Đạt</td></tr></table>`;
  assert.deepEqual(parseSpreadsheetClipboard("07/11/2026\tĐạt\r\n", dateHtml), [["07/11/2026", "Đạt"]]);
  const shiftedHtml = `<table><tr><td x:num="8.2567">8,3</td></tr><tr><td x:num="1.25">1,3</td></tr></table>`;
  assert.deepEqual(parseSpreadsheetClipboard("8,3\t1,3\r\n", shiftedHtml), [["8.3", "1.3"]]);
});

test("ô định dạng phần trăm được đổi về đúng số % đang dùng", () => {
  const html = `<table><tr><td x:num="0.082567">8,3%</td></tr></table>`;
  assert.deepEqual(parseSpreadsheetClipboard("8,3%\r\n", html), [["8.2567"]]);
});
