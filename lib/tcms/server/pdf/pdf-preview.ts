import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createWorker, OEM, type Lang } from "tesseract.js";

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

async function localLanguages(): Promise<Lang[]> {
  const languageFiles = [
    ["vie", join(process.cwd(), "node_modules", "@tesseract.js-data", "vie", "4.0.0_best_int", "vie.traineddata.gz")],
    ["eng", join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz")],
  ] as const;
  return Promise.all(
    languageFiles.map(async ([code, languageFile]) => {
      return { code, data: new Uint8Array(await readFile(/* turbopackIgnore: true */ languageFile)) };
    }),
  );
}

export async function extractPdfPreview(data: Buffer): Promise<PdfExtraction> {
  const parser = new PDFParse({ data });
  try {
    const extracted = await parser.getText();
    const pageCount = extracted.total;
    const text = normalizePdfText(extracted.text ?? "");
    if (hasUsefulPdfText(text, pageCount)) return { source: "text", pageCount, text, textLength: text.length };

    const screenshots = await parser.getScreenshot({ desiredWidth: OCR_WIDTH, imageBuffer: true, imageDataUrl: false });
    const worker = await createWorker(await localLanguages(), OEM.LSTM_ONLY, { cacheMethod: "none" });
    try {
      const pages: string[] = [];
      for (const page of screenshots.pages) {
        const result = await worker.recognize(Buffer.from(page.data));
        const pageText = normalizePdfText(result.data.text ?? "");
        if (pageText) pages.push(`--- Trang ${page.pageNumber}/${pageCount} ---\n${pageText}`);
      }
      const ocrText = normalizePdfText(pages.join("\n\n"));
      return { source: "ocr", pageCount, text: ocrText, textLength: ocrText.length };
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
}
