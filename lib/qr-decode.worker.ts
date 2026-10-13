// Web Worker giải mã QR — chạy ngoài luồng giao diện nên hình camera không giật. Tạo ở lib/qr-camera.ts.
//
// Bộ giải mã chính là ZXing-C++ biên dịch WebAssembly (zxing-wasm): thử trên ảnh giả lập 13/10/2026, ảnh nhiễu
// đọc 6/6 khung ở mọi cỡ mã trong khi @zxing/library (bản JS cũ) 0/6, mờ nhẹ 4–6/6 so với 0–4/6, cùng ~7 ms/khung.
// Tệp .wasm (~1 MB) tự đặt ở public/ — không lấy từ CDN mặc định của gói, mạng nhà máy có thể chặn. Trong lúc tệp
// đang tải hoặc tải lỗi thì giải mã bằng bản JS (lib/qr-decode.ts) để quét không phải chờ.
import { prepareZXingModule, readBarcodes, type ReadResult } from "zxing-wasm/reader";
import { decodeQrRgba, sharpenRgba, type QrBox, type QrDecodeResult } from "./qr-decode";
import { ZXING_WASM_PATH } from "./qr-wasm-asset";

export type QrDecoderName = "wasm" | "js";
export type DecodeRequest = { id: number; buffer: ArrayBuffer; width: number; height: number; sharpen: boolean; forceJs?: boolean };
export type DecodeResponse = QrDecodeResult & { id: number; decodeMs: number; decoder: QrDecoderName };

let wasmState: "loading" | "ready" | "failed" = "loading";
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? new URL(ZXING_WASM_PATH, self.location.origin).href : prefix + path) },
  fireImmediately: true,
}).then(() => { wasmState = "ready"; }, () => { wasmState = "failed"; });

const READER_OPTIONS = {
  formats: ["QRCode"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false, // thẻ in mã đen trên nền sáng — bỏ lượt thử mã đảo màu cho nhanh
  maxNumberOfSymbols: 1,
  // Trả cả mã thấy mà đọc lỗi (checksum/format) kèm vị trí → lượt kế phóng to đúng chỗ đó (kiểu WeChat).
  returnErrors: true,
} as const;

function boxOf(result: ReadResult): QrBox {
  const p = result.position;
  const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
  const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

async function decodeWasm(image: ImageData): Promise<QrDecodeResult> {
  const results = await readBarcodes(image, { ...READER_OPTIONS, formats: [...READER_OPTIONS.formats] });
  const valid = results.find(result => result.isValid && result.text);
  if (valid) return { text: valid.text, partial: false, box: boxOf(valid) };
  const broken = results[0];
  return broken ? { text: null, partial: true, box: boxOf(broken) } : { text: null, partial: false, box: null };
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, buffer, width, height, sharpen, forceJs } = event.data;
  const startedAt = performance.now();
  const rgba = new Uint8ClampedArray(buffer);
  if (sharpen) sharpenRgba(rgba, width, height);
  let decoder: QrDecoderName = "js";
  let result: QrDecodeResult;
  if (!forceJs && wasmState === "ready") {
    try {
      result = await decodeWasm(new ImageData(rgba, width, height));
      decoder = "wasm";
    } catch {
      result = decodeQrRgba(rgba, width, height);
    }
  } else {
    result = decodeQrRgba(rgba, width, height);
  }
  const response: DecodeResponse = { id, ...result, decodeMs: performance.now() - startedAt, decoder };
  self.postMessage(response);
};
