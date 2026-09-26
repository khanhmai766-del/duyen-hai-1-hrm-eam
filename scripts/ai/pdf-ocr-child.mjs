#!/usr/bin/env node
/**
 * OCR một PDF scan trong TIẾN TRÌNH RIÊNG — do lib/tcms/server/pdf/pdf-preview.ts gọi, không chạy tay.
 *
 * Vì sao tách khỏi tiến trình web: dựng ảnh trang + tesseract (vie+eng) cần vài trăm MB bộ nhớ
 * native (luồng WASM, arena glibc) mà Node KHÔNG trả lại hệ điều hành sau khi xong. Chạy trong
 * next-server thì mỗi tài liệu scan đẩy RSS lên một nấc, vượt `max_memory_restart` 1,2 GB → pm2
 * khởi động lại → web 502 (đo trên production 18–23/09/2026). Tiến trình con thoát là trả sạch.
 *
 * Giao kèo: `node pdf-ocr-child.mjs <đường-dẫn-pdf> <số-trang>`
 *   stdout: đúng MỘT dòng JSON `{ "text": "..." }` hoặc `{ "error": "..." }`; mã thoát 0 / 1.
 * Ảnh trang được dựng TỪNG TRANG MỘT (không giữ cả tài liệu trong RAM như getScreenshot() toàn bộ).
 */
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createWorker, OEM } from "tesseract.js";

PDFParse.setWorker(getData());

const OCR_WIDTH = 1800;
const TESSERACT_LANGS = ["vie", "eng"];
const TESSDATA_VERSION = "4.0.0_best_int";

function normalizePdfText(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * KHÔNG truyền mảng `{ code, data }` cho createWorker: tesseract.js 7.0.0 lấy DỮ LIỆU làm TÊN
 * ngôn ngữ (worker-script/index.js dòng 238, `l.data` thay vì `l.code`) → log 5,8 MB mỗi dòng và
 * uncaughtException. Truyền mã dạng chuỗi + `langPath` một thư mục, nên gom hai gói dữ liệu về
 * một chỗ; chép một lần rồi dùng lại. So kích thước để bản chép dở (đầy đĩa, bị giết giữa chừng)
 * được chép lại. Bỏ hàm này khi tesseract.js vá dòng 238.
 */
async function tessdataDir() {
  const dir = join(tmpdir(), `dh1-tessdata-${TESSDATA_VERSION}`);
  await mkdir(dir, { recursive: true });
  await Promise.all(TESSERACT_LANGS.map(async (code) => {
    const name = `${code}.traineddata.gz`;
    const source = join(process.cwd(), "node_modules", "@tesseract.js-data", code, TESSDATA_VERSION, name);
    const target = join(dir, name);
    const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target).catch(() => null)]);
    if (targetStat?.size !== sourceStat.size) await copyFile(source, target);
  }));
  return dir;
}

async function main() {
  const [file, pageArg] = process.argv.slice(2);
  const pageCount = Number(pageArg);
  if (!file || !Number.isInteger(pageCount) || pageCount < 1) throw new Error("Thiếu đường dẫn PDF hoặc số trang");

  const parser = new PDFParse({ data: await readFile(file) });
  // `errorHandler` phải CHỦ ĐỘNG reject và mọi lệnh OCR chạy đua với tín hiệu đó: tesseract.js
  // phát lỗi worker bằng `throw` trong callback (ngoài mọi promise) hoặc không settle promise nào
  // → hoặc uncaughtException, hoặc treo vô hạn. Có tiến trình riêng thì treo vẫn bị cha giết theo
  // thời hạn, nhưng báo lỗi rõ vẫn tốt hơn.
  let signalWorkerError;
  const workerError = new Promise((_, reject) => { signalWorkerError = reject; });
  workerError.catch(() => undefined);
  let worker;
  try {
    worker = await Promise.race([
      createWorker(TESSERACT_LANGS, OEM.LSTM_ONLY, {
        langPath: await tessdataDir(),
        cacheMethod: "none",
        gzip: true,
        errorHandler: (message) => signalWorkerError(new Error(`Worker OCR lỗi: ${String(message).slice(0, 300)}`)),
      }),
      workerError,
    ]);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const shot = await parser.getScreenshot({ partial: [pageNumber], desiredWidth: OCR_WIDTH, imageBuffer: true, imageDataUrl: false });
      const page = shot.pages[0];
      if (!page?.data) continue;
      const result = await Promise.race([worker.recognize(Buffer.from(page.data)), workerError]);
      const pageText = normalizePdfText(result.data.text ?? "");
      if (pageText) pages.push(`--- Trang ${pageNumber}/${pageCount} ---\n${pageText}`);
    }
    return normalizePdfText(pages.join("\n\n"));
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
    await parser.destroy().catch(() => undefined);
  }
}

// tesseract.js có nhánh `throw` ngoài promise: vẫn trả về đúng một dòng JSON lỗi thay vì stack trace.
process.on("uncaughtException", (error) => {
  process.stdout.write(`${JSON.stringify({ error: `Worker OCR lỗi: ${String(error?.message ?? error).slice(0, 1000)}` })}\n`, () => process.exit(1));
});

main().then(
  (text) => { process.stdout.write(`${JSON.stringify({ text })}\n`, () => process.exit(0)); },
  (error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ error: message.slice(0, 1000) })}\n`, () => process.exit(1));
  },
);
