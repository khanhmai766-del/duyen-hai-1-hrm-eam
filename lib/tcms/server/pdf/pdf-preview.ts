import { copyFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createWorker, OEM } from "tesseract.js";

PDFParse.setWorker(getData());

const OCR_WIDTH = 1800;

export type PdfExtraction = { source: "text" | "ocr"; pageCount: number; text: string; textLength: number };

export function normalizePdfText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function hasUsefulPdfText(text: string, pageCount: number) {
  const content = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "");
  const usefulCharacters = content.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return usefulCharacters >= Math.max(120, pageCount * 80);
}

const TESSERACT_LANGS = ["vie", "eng"] as const;
const TESSDATA_VERSION = "4.0.0_best_int";

/**
 * KHÔNG truyền mảng `{ code, data }` cho createWorker, dù index.d.ts công bố đúng kiểu đó.
 * tesseract.js 7.0.0 có lỗi ở `initialize` (worker-script/index.js dòng 238):
 *
 *     _langs.map((l) => ((typeof l === 'string') ? l : l.data)).join('+')
 *                                                   ^^^^^^ đáng lẽ l.code
 *
 * Nó lấy DỮ LIỆU làm TÊN ngôn ngữ, nên tên ngôn ngữ thành cả mảng byte của tệp .gz.
 * Tesseract báo `Failed loading language '31,139,8,...'` (31,139,8 là magic gzip) rồi in
 * nguyên mảng ra log. Đo trên production 20/09/2026: ~5,8 MB MỖI DÒNG, 45 dòng ngốn
 * 262 MB, kèm 48 uncaughtException làm pm2 restart liên tục. 7.0.0 là bản mới nhất —
 * chưa có bản vá để nâng lên.
 *
 * Nhánh truyền MÃ dạng chuỗi không dính lỗi (chuỗi đi thẳng qua `map`), nhưng nó đọc tệp
 * theo `langPath` — mà `langPath` chỉ nhận MỘT thư mục, trong khi hai gói dữ liệu nằm ở
 * hai thư mục khác nhau. Nên gom bản sao vào một chỗ; chép một lần rồi dùng lại.
 *
 * Bỏ hàm này và quay lại `{ code, data }` khi tesseract.js vá dòng 238.
 */
async function tessdataDir() {
  const dir = join(tmpdir(), `dh1-tessdata-${TESSDATA_VERSION}`);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    TESSERACT_LANGS.map(async (code) => {
      const name = `${code}.traineddata.gz`;
      const source = join(process.cwd(), "node_modules", "@tesseract.js-data", code, TESSDATA_VERSION, name);
      const target = join(dir, name);
      // So kích thước thay vì chỉ kiểm tồn tại: bản chép dở dang (đầy đĩa, tiến trình bị
      // giết giữa chừng) vẫn tồn tại nhưng hỏng, và lỗi đó rất khó lần ra.
      const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target).catch(() => null)]);
      if (targetStat?.size !== sourceStat.size) await copyFile(source, target);
    }),
  );
  return dir;
}

export async function extractPdfPreview(data: Buffer): Promise<PdfExtraction> {
  const parser = new PDFParse({ data });
  try {
    const extracted = await parser.getText();
    const pageCount = extracted.total;
    const text = normalizePdfText(extracted.text ?? "");
    if (hasUsefulPdfText(text, pageCount)) return { source: "text", pageCount, text, textLength: text.length };

    const screenshots = await parser.getScreenshot({ desiredWidth: OCR_WIDTH, imageBuffer: true, imageDataUrl: false });
    // `errorHandler` KHÔNG phải tuỳ chọn trang trí. tesseract.js phát lỗi worker bằng
    // `throw` ngay trong callback onMessage (createWorker.js dòng 216) — ngoài mọi promise,
    // nên `try/catch` quanh `await` KHÔNG bắt được: Node nâng thành uncaughtException,
    // route chết giữa chừng và khối catch ghi `aiIndexError` không bao giờ chạy tới. Hậu
    // quả đã thấy trên production: tài liệu hỏng vì OCR trông y hệt tài liệu chưa tới lượt,
    // không cách nào phân biệt (xem scripts/check/document-ai-index.ts).
    //
    // Nhưng truyền errorHandler suông thì chỉ đổi crash thành TREO: nhánh `throw` bị bỏ qua
    // (dòng 214) mà `workerResReject` lại chỉ chạy khi `action === "load"`, nên nhiều lỗi
    // không có promise nào settle — đã dựng lại được bằng langPath trỏ vào thư mục không
    // tồn tại: tiến trình treo vô hạn. Treo còn tệ hơn crash vì n8n chỉ thấy timeout.
    // Nên errorHandler phải CHỦ ĐỘNG reject, và mọi lệnh OCR đều chạy đua với tín hiệu đó.
    let signalWorkerError!: (error: Error) => void;
    const workerError = new Promise<never>((_, reject) => {
      signalWorkerError = reject;
    });
    // Luôn có một người nghe, kẻo lần lỗi nào không ai đua cùng sẽ thành unhandledRejection.
    workerError.catch(() => undefined);

    const worker = await Promise.race([
      createWorker([...TESSERACT_LANGS], OEM.LSTM_ONLY, {
        langPath: await tessdataDir(),
        cacheMethod: "none",
        gzip: true,
        errorHandler: (message: unknown) => signalWorkerError(new Error(`Worker OCR lỗi: ${message}`)),
      }),
      workerError,
    ]);
    try {
      const pages: string[] = [];
      for (const page of screenshots.pages) {
        const result = await Promise.race([worker.recognize(Buffer.from(page.data)), workerError]);
        const pageText = normalizePdfText(result.data.text ?? "");
        if (pageText) pages.push(`--- Trang ${page.pageNumber}/${pageCount} ---\n${pageText}`);
      }
      const ocrText = normalizePdfText(pages.join("\n\n"));
      return { source: "ocr", pageCount, text: ocrText, textLength: ocrText.length };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } finally {
    await parser.destroy();
  }
}
