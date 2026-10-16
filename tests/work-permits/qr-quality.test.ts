import assert from "node:assert/strict";
import test from "node:test";
import { qrFrameQuality } from "../../lib/qr-decode";

// Ảnh giả kiểu ô QR: ô cờ đen/trắng cạnh `cell` điểm ảnh, tuỳ chọn làm mờ ngang và chồng vùng cháy sáng.
function checker(size: number, cell: number, { blur = 0, glareRows = 0 } = {}) {
  const gray = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    gray[y * size + x] = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 230 : 20;
  }
  let image = gray;
  if (blur) {
    image = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0, n = 0;
      for (let k = -blur; k <= blur; k++) { const xx = x + k; if (xx >= 0 && xx < size) { sum += gray[y * size + xx]; n++; } }
      image[y * size + x] = sum / n;
    }
  }
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.floor(i / size) < glareRows ? 255 : image[i];
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = value; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

const box = { x: 0, y: 0, w: 200, h: 200 };

test("ảnh ô QR nét: độ nét cao, không lóa", () => {
  const q = qrFrameQuality(checker(200, 10), 200, 200, box)!;
  assert.equal(q.glare, 0);
  assert.equal(q.contrast, 210);
  assert.ok(q.sharp >= 0.9, `sharp=${q.sharp}`);
});

test("ảnh mờ: độ nét thấp hơn hẳn ảnh nét", () => {
  const sharp = qrFrameQuality(checker(200, 10), 200, 200, box)!;
  const blurred = qrFrameQuality(checker(200, 10, { blur: 4 }), 200, 200, box)!;
  assert.ok(blurred.sharp < 0.3, `sharp=${blurred.sharp}`);
  assert.ok(blurred.sharp < sharp.sharp / 3);
});

test("vùng cháy sáng: glare đúng tỉ lệ", () => {
  const q = qrFrameQuality(checker(200, 10, { glareRows: 50 }), 200, 200, box)!;
  assert.ok(Math.abs(q.glare - 0.25) <= 0.02, `glare=${q.glare}`);
});

test("khung nằm ngoài ảnh hoặc quá nhỏ trả null", () => {
  assert.equal(qrFrameQuality(checker(200, 10), 200, 200, { x: 300, y: 300, w: 50, h: 50 }), null);
  assert.equal(qrFrameQuality(checker(200, 10), 200, 200, { x: 10, y: 10, w: 4, h: 40 }), null);
});
