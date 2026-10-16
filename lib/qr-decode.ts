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
  /** Chất lượng vùng mã ở khung "thấy mà đọc lỗi" (qrFrameQuality) — để biết kẹt vì lóa hay vì mờ. */
  quality?: QrQuality | null;
};

/**
 * Chất lượng vùng mã trên một khung — chỉ đo khung thấy mã mà đọc lỗi, để phân biệt nguyên nhân kẹt:
 *   - glare: tỉ lệ điểm ảnh cháy sáng (độ sáng ≥ 250) — thẻ ép nhựa phản đèn;
 *   - contrast: độ sáng p95 − p5 (0–255) — thấp = tối/lóa đều/nhòe;
 *   - sharp: độ dốc trung bình của 1% cạnh dốc nhất ÷ contrast — cạnh ô QR nét ≈ 0,5–1, mờ (cầm quá gần, rung) → nhỏ.
 * Log 16/10/2026: "thấy mã mà chưa đọc được" chiếm 36% thời gian chờ trên iPhone, ở mọi cỡ mã — chưa rõ nguyên nhân.
 */
export type QrQuality = { glare: number; contrast: number; sharp: number };
const GLARE_LUMA = 250;
/** Số điểm ảnh lấy mẫu tối đa trong vùng mã — đủ ổn định, không làm chậm Worker. */
const QUALITY_SAMPLES = 40_000;

export function qrFrameQuality(rgba: Uint8ClampedArray, width: number, height: number, box: QrBox): QrQuality | null {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.w)), y1 = Math.min(height, Math.ceil(box.y + box.h));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  const step = Math.max(1, Math.floor(Math.sqrt((x1 - x0) * (y1 - y0) / QUALITY_SAMPLES)));
  const luma = (x: number, y: number) => { const j = (y * width + x) * 4; return (rgba[j] + 2 * rgba[j + 1] + rgba[j + 2]) >> 2; };
  const levels = new Uint32Array(256), slopes = new Uint32Array(256);
  let count = 0, bright = 0, slopeCount = 0;
  // Lấy mẫu theo hàng cách `step`; độ dốc đo giữa hai điểm ảnh LIỀN NHAU trên hàng (giữ đúng độ nét gốc).
  for (let y = y0; y < y1; y += step) {
    let prev = luma(x0, y);
    for (let x = x0 + 1; x < x1; x++) {
      const value = luma(x, y);
      slopes[Math.abs(value - prev)]++; slopeCount++;
      prev = value;
      if ((x - x0) % step === 0) { levels[value]++; count++; if (value >= GLARE_LUMA) bright++; }
    }
  }
  if (!count || !slopeCount) return null;
  const quantile = (hist: Uint32Array, total: number, q: number) => {
    let seen = 0;
    for (let i = 0; i < 256; i++) { seen += hist[i]; if (seen >= total * q) return i; }
    return 255;
  };
  const contrast = quantile(levels, count, 0.95) - quantile(levels, count, 0.05);
  // Trung bình 1% độ dốc lớn nhất
  const top = Math.max(1, Math.round(slopeCount * 0.01));
  let taken = 0, sum = 0;
  for (let i = 255; i >= 0 && taken < top; i--) {
    const use = Math.min(slopes[i], top - taken);
    taken += use; sum += use * i;
  }
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return { glare: round2(bright / count), contrast, sharp: contrast > 0 ? round2(Math.min(2, sum / taken / contrast)) : 0 };
}

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
