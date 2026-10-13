/**
 * Tệp WebAssembly của ZXing-C++ (gói zxing-wasm, ghim đúng phiên bản trong package.json) chép sẵn vào public/ để tự
 * phục vụ — không dùng CDN jsDelivr mặc định của gói. Đường dẫn mang số phiên bản để bộ nhớ đệm trình duyệt không
 * giữ nhầm bản cũ. Nâng zxing-wasm thì chép lại tệp:
 *   cp node_modules/zxing-wasm/dist/reader/zxing_reader.wasm public/vendor/zxing-wasm/<phiên bản>/zxing_reader.wasm
 * rồi đổi hằng dưới đây; tests/qr-wasm-asset.test.ts kiểm tệp khớp phiên bản và mã băm của gói.
 */
export const ZXING_WASM_VERSION = "3.1.4";
export const ZXING_WASM_PATH = `/vendor/zxing-wasm/${ZXING_WASM_VERSION}/zxing_reader.wasm`;
