// @zxing/library là peer dependency của @zxing/browser (npm tự cài kèm) — dùng thẳng lõi giải mã, không cần DOM,
// nên chạy được cả trong Web Worker (lib/qr-decode.worker.ts) lẫn luồng chính. Từ 13/10/2026 đây chỉ là bộ giải mã
// DỰ PHÒNG: Worker dùng ZXing-C++ (zxing-wasm), bản JS này chỉ chạy khi tệp .wasm chưa tải xong / tải lỗi.
import { BinaryBitmap, ChecksumException, DecodeHintType, FormatException, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

/** Khung chữ nhật trên ảnh (điểm ảnh). */
export type QrBox = { x: number; y: number; w: number; h: number };

export type QrDecodeResult = {
  text: string | null;
  /** Thấy hình mã QR nhưng chưa đọc được (lóa, mờ, cong) — dùng đo "camera loay hoay" trước khi bắt được mã. */
  partial: boolean;
  /** Vị trí mã trên ảnh vừa giải mã, nếu bộ giải mã cho biết (ZXing-C++ có, bản JS không). */
  box?: QrBox | null;
};

const reader = new QRCodeReader();
const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

/** Giải mã một khung RGBA (từ getImageData) đã cắt sẵn vùng khung ngắm — bản JS dự phòng. */
export function decodeQrRgba(rgba: Uint8ClampedArray, width: number, height: number): QrDecodeResult {
  const luma = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < luma.length; i++, j += 4) luma[i] = (rgba[j] + 2 * rgba[j + 1] + rgba[j + 2]) >> 2;
  try {
    const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luma, width, height))), hints);
    return { text: result.getText(), partial: false };
  } catch (error) {
    return { text: null, partial: error instanceof ChecksumException || error instanceof FormatException };
  } finally {
    reader.reset();
  }
}

/**
 * Làm nét (unsharp mask) ảnh RGBA tại chỗ, kênh xám: out = L + amount·(L − mờ(L)), mờ = hộp (2r+1)² tách hai chiều.
 * Dùng cho lượt phóng to (đã nội suy nên mềm): thử trên ảnh giả lập, phóng ×2 + làm nét đọc được ca "mờ + lóa +
 * nhiễu" 3–4/5 khung thay vì 0–1/5. Ảnh xám (R=G=B) sau khi làm nét — bộ giải mã chỉ dùng độ sáng.
 */
export function sharpenRgba(rgba: Uint8ClampedArray, width: number, height: number, radius = 2, amount = 1.2) {
  const n = width * height;
  const luma = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) luma[i] = (rgba[j] + 2 * rgba[j + 1] + rgba[j + 2]) / 4;
  const tmp = new Float32Array(n);
  const span = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += luma[row + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / span;
      sum += luma[row + Math.min(width - 1, x + radius + 1)] - luma[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      const v = luma[i] + amount * (luma[i] - sum / span);
      const j = i * 4;
      rgba[j] = rgba[j + 1] = rgba[j + 2] = v;
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
    }
  }
}
