// Web Worker giải mã QR cho máy không có BarcodeDetector (iPhone, Chrome máy tính) — zxing chạy ngoài luồng
// giao diện nên hình camera không còn giật/đứng khi đang giải mã. Tạo ở lib/qr-camera.ts.
import { decodeQrRgba } from "./qr-decode";

type DecodeRequest = { id: number; buffer: ArrayBuffer; width: number; height: number };

self.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, buffer, width, height } = event.data;
  const startedAt = performance.now();
  const result = decodeQrRgba(new Uint8ClampedArray(buffer), width, height);
  self.postMessage({ id, ...result, decodeMs: performance.now() - startedAt });
};
