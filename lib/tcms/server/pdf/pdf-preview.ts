import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

PDFParse.setWorker(getData());

export type PdfExtraction = { source: "text" | "ocr"; pageCount: number; text: string; textLength: number };

export function normalizePdfText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function hasUsefulPdfText(text: string, pageCount: number) {
  const content = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "");
  const usefulCharacters = content.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return usefulCharacters >= Math.max(120, pageCount * 80);
}

// Bản chữ OCR được cache theo băm nội dung PDF: n8n thử lại tài liệu lỗi (vd Gemini 429 ở bước
// embedding sau OCR) mỗi 5 phút — không cache thì mỗi lần thử lại OCR cả tài liệu từ đầu.
// Đổi OCR_CACHE_VERSION khi đổi cách OCR (độ rộng ảnh, gói ngôn ngữ) để bỏ cache cũ.
const OCR_CACHE_VERSION = "v1-1800-vie+eng-best_int";
const OCR_CACHE_DIR = join(tmpdir(), "dh1-pdf-ocr-cache");
const OCR_CACHE_MAX_AGE_MS = 30 * 24 * 3600_000;
// Tính theo trang cho tài liệu dài, có trần để tiến trình con treo vẫn bị dọn.
const OCR_TIMEOUT_BASE_MS = 60_000;
const OCR_TIMEOUT_PER_PAGE_MS = 30_000;
const OCR_TIMEOUT_MAX_MS = 30 * 60_000;
const OCR_CHILD_HEAP_MB = 512;
const OCR_STDOUT_MAX = 32 * 1024 * 1024;

function ocrCacheFile(data: Buffer) {
  const hash = createHash("sha256").update(OCR_CACHE_VERSION).update(data).digest("hex");
  return join(OCR_CACHE_DIR, `${hash}.txt`);
}

async function readOcrCache(file: string) {
  return readFile(file, "utf8").catch(() => null);
}

async function writeOcrCache(file: string, text: string) {
  try {
    await mkdir(OCR_CACHE_DIR, { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, text, "utf8");
    await rename(temp, file);
    // Dọn cache quá hạn ngay lúc ghi — ít tệp, không cần lịch riêng.
    const now = Date.now();
    for (const name of await readdir(OCR_CACHE_DIR)) {
      const path = join(OCR_CACHE_DIR, name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > OCR_CACHE_MAX_AGE_MS) await rm(path, { force: true });
    }
  } catch {
    // Cache chỉ để tiết kiệm lần sau; ghi hỏng không được làm hỏng lượt OCR đã xong.
  }
}

// Mỗi lúc chỉ MỘT tiến trình OCR: hai tài liệu scan cùng lúc là gấp đôi vài trăm MB trên máy 4 GB.
let ocrQueue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = ocrQueue.then(task, task);
  ocrQueue = run.catch(() => undefined);
  return run;
}

/**
 * OCR trong tiến trình con `scripts/ai/pdf-ocr-child.mjs` (lý do ở đầu tệp đó): bộ nhớ native của
 * tesseract/dựng ảnh trả về hệ điều hành khi con thoát, next-server không phình theo từng tài liệu.
 */
function ocrInChildProcess(data: Buffer, pageCount: number) {
  return runExclusive(async () => {
    const workDir = await mkdtemp(join(tmpdir(), "dh1-pdf-ocr-"));
    try {
      const pdfPath = join(workDir, "input.pdf");
      await writeFile(pdfPath, data);
      const script = join(process.cwd(), "scripts", "ai", "pdf-ocr-child.mjs");
      const timeoutMs = Math.min(OCR_TIMEOUT_MAX_MS, OCR_TIMEOUT_BASE_MS + pageCount * OCR_TIMEOUT_PER_PAGE_MS);
      return await new Promise<string>((resolve, reject) => {
        const child: ChildProcess = spawn(process.execPath, [`--max-old-space-size=${OCR_CHILD_HEAP_MB}`, script, pdfPath, String(pageCount)], {
          cwd: process.cwd(),
          // Chỉ biến cần cho Node; không chuyển bí mật của app (DATABASE_URL, khoá API) sang tiến trình con.
          env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "", TEMP: process.env.TEMP ?? "", TMP: process.env.TMP ?? "", SystemRoot: process.env.SystemRoot ?? "" },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`OCR quá ${Math.round(timeoutMs / 60_000)} phút, đã dừng`)); }, timeoutMs);
        child.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
          stdout += chunk;
          if (stdout.length > OCR_STDOUT_MAX) { child.kill("SIGKILL"); reject(new Error("Kết quả OCR vượt giới hạn")); }
        });
        // Chỉ giữ đuôi ngắn: tesseract.js từng in cả mảng byte 5,8 MB mỗi dòng ra log.
        child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("close", (code) => {
          clearTimeout(timer);
          const line = stdout.trim().split("\n").pop() ?? "";
          let parsed: { text?: unknown; error?: unknown } | null = null;
          try { parsed = JSON.parse(line); } catch { parsed = null; }
          if (code === 0 && typeof parsed?.text === "string") return resolve(parsed.text);
          const detail = typeof parsed?.error === "string" ? parsed.error : stderr.trim().split("\n").pop() || `mã thoát ${code}`;
          reject(new Error(detail.startsWith("Worker OCR lỗi") ? detail : `OCR lỗi: ${detail}`));
        });
      });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

export async function extractPdfPreview(data: Buffer): Promise<PdfExtraction> {
  const parser = new PDFParse({ data });
  let pageCount: number;
  try {
    const extracted = await parser.getText();
    pageCount = extracted.total;
    const text = normalizePdfText(extracted.text ?? "");
    if (hasUsefulPdfText(text, pageCount)) return { source: "text", pageCount, text, textLength: text.length };
  } finally {
    // Đóng trước khi OCR: tiến trình con tự mở PDF, không giữ bản thứ hai trong next-server suốt lượt OCR.
    await parser.destroy();
  }

  const cacheFile = ocrCacheFile(data);
  const cached = await readOcrCache(cacheFile);
  const ocrText = cached ?? await ocrInChildProcess(data, pageCount);
  if (cached === null) await writeOcrCache(cacheFile, ocrText);
  return { source: "ocr", pageCount, text: ocrText, textLength: ocrText.length };
}
