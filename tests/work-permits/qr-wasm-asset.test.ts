import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ZXING_WASM_SHA256 } from "zxing-wasm/reader";
import { ZXING_WASM_PATH, ZXING_WASM_VERSION } from "../../lib/qr-wasm-asset";
import { sharpenRgba } from "../../lib/qr-decode";

// Tệp .wasm tự phục vụ ở public/ phải đúng bản mà mã JS của gói zxing-wasm mong đợi — lệch thì Worker nạp lỗi và
// lặng lẽ lùi về bộ giải mã JS cũ (quét chậm lại mà không ai thấy).
test("tệp zxing_reader.wasm trong public/ khớp phiên bản và mã băm của gói zxing-wasm", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "node_modules/zxing-wasm/package.json"), "utf8")) as { version: string };
  assert.equal(pkg.version, ZXING_WASM_VERSION, "đã nâng zxing-wasm — chép lại tệp .wasm và đổi ZXING_WASM_VERSION");
  const file = join(process.cwd(), "public", ZXING_WASM_PATH);
  assert.ok(existsSync(file), `thiếu ${file}`);
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), ZXING_WASM_SHA256);
});

test("proxy.ts để tệp .wasm đi thẳng như tệp tĩnh (không qua kiểm tra phiên đăng nhập)", () => {
  const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
  assert.match(proxy, /\|wasm\)\$/);
});

test("làm nét giữ nguyên vùng đồng màu và tăng tương phản ở cạnh", () => {
  const width = 8, height = 1;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const levels = [100, 100, 100, 100, 200, 200, 200, 200];
  levels.forEach((v, i) => { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; });
  sharpenRgba(rgba, width, height, 1, 1);
  assert.equal(rgba[0], 100);
  assert.equal(rgba[7 * 4], 200);
  assert.ok(rgba[3 * 4] < 100, "phía tối của cạnh tối hơn");
  assert.ok(rgba[4 * 4] > 200, "phía sáng của cạnh sáng hơn");
  assert.equal(rgba[3], 255, "giữ kênh alpha");
});
