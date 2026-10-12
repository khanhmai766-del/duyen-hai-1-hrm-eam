// @zxing/library là peer dependency của @zxing/browser (npm tự cài kèm) — dùng thẳng lõi giải mã, không cần DOM,
// nên chạy được cả trong Web Worker (lib/qr-decode.worker.ts) lẫn luồng chính.
import { BinaryBitmap, ChecksumException, DecodeHintType, FormatException, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

export type QrDecodeResult = {
  text: string | null;
  /** Thấy hình mã QR nhưng chưa đọc được (lóa, mờ, cong) — dùng đo "camera loay hoay" trước khi bắt được mã. */
  partial: boolean;
};

const reader = new QRCodeReader();
const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

/** Giải mã một khung RGBA (từ getImageData) đã cắt sẵn vùng khung ngắm. */
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
