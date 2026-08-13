/**
 * Bộ dựng PDF dùng chung của module PCCC: khổ giấy, phông chữ, kẻ ô, vẽ chữ trong ô và
 * xử lý ảnh chữ ký. Tách ra vì đã có HAI loại sổ in (Mẫu số 01 cho bình/tủ chữa cháy và
 * bảng Foam·CO2·Diesel·FM200) — nhân bản mấy hàm này ở hai chỗ là sớm muộn hai bản in
 * lệch nhau về phông, lề, độ dày nét.
 *
 * Vài ràng buộc đã trả giá mới biết, đừng sửa nếu chưa đọc:
 *
 *  - PHÔNG CHỮ phải nhúng từ tệp trong repo (`assets/fonts`). 14 phông có sẵn của PDF
 *    đều là WinAnsi — chữ Việt có dấu sẽ NÉM LỖI khi vẽ, không phải chỉ hiện sai. Máy
 *    dev Windows và server Linux không chung bộ phông hệ thống nên không đọc phông máy.
 *  - Ảnh chữ ký phải ÉP NỀN TRẮNG và tô lại mực xanh trước khi nhúng — xem `signatureInk`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** A4 NGANG. Cả hai loại sổ đều là bảng nhiều cột, khổ dọc là vỡ bảng. */
export const PAGE = { w: 842, h: 595 };
export const MARGIN = 40;
export const CONTENT_W = PAGE.w - MARGIN * 2;

export const BLACK = rgb(0, 0, 0);
export const LINE = 0.8;
export const FS = { title: 13, sub: 11, body: 9, small: 8 };

export type PdfFonts = { regular: PDFFont; bold: PDFFont };

export async function loadPdfFonts(pdf: PDFDocument): Promise<PdfFonts> {
  const dir = path.join(process.cwd(), "assets", "fonts");
  try {
    const [regular, bold] = await Promise.all([
      fs.readFile(path.join(dir, "DejaVuSerif.ttf")),
      fs.readFile(path.join(dir, "DejaVuSerif-Bold.ttf")),
    ]);
    return { regular: await pdf.embedFont(regular, { subset: true }), bold: await pdf.embedFont(bold, { subset: true }) };
  } catch {
    // Thiếu tệp phông là lỗi cài đặt, KHÔNG được im lặng rơi về phông chuẩn: nó không
    // vẽ được chữ Việt nên sổ in ra sẽ mất dấu hoặc hỏng giữa chừng.
    throw new Error("Thiếu phông chữ để dựng PDF (assets/fonts/DejaVuSerif.ttf). Kiểm tra lại bản triển khai.");
  }
}

/** Cắt chuỗi thành nhiều dòng vừa bề rộng ô. Cắt theo TỪ, từ nào dài quá thì cắt cứng. */
export function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 3): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of clean.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
      let cut = current.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
    if (lines.length >= maxLines) break;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, lines[maxLines - 1].length - 1))}…`;
  }
  return lines;
}

export function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, y: number) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE.w - w) / 2, y, size, font, color: BLACK });
}

/** Vẽ chữ trong ô, canh trái/giữa và canh giữa theo chiều dọc của ô. */
export function drawCell(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; w: number; h: number; font: PDFFont; size: number; align?: "left" | "center"; maxLines?: number }
) {
  const pad = 3;
  const lines = wrap(text, opts.font, opts.size, opts.w - pad * 2, opts.maxLines ?? 3);
  const lineH = opts.size + 2;
  const blockH = lines.length * lineH;
  let cursor = opts.y + opts.h / 2 + blockH / 2 - opts.size;
  for (const line of lines) {
    const lineW = opts.font.widthOfTextAtSize(line, opts.size);
    const x = opts.align === "center" ? opts.x + (opts.w - lineW) / 2 : opts.x + pad;
    page.drawText(line, { x, y: cursor, size: opts.size, font: opts.font, color: BLACK });
    cursor -= lineH;
  }
}

export function rect(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: BLACK, borderWidth: LINE });
}

export function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * MỰC CHỮ KÝ trên bản in. Chữ ký lưu trong hồ sơ vẽ bằng #0f172a (xanh gần như đen) nên
 * in ra trông hệt bản photocopy. Văn bản hành chính cần thấy rõ đây là chữ ký TƯƠI, nên
 * bản in tô lại nét sang mực xanh — chỉ đổi TÔNG MÀU, giữ nguyên hình nét và độ đậm nhạt
 * của từng điểm ảnh, không vẽ lại chữ ký.
 */
const INK = { r: 11, g: 61, b: 145 };

/**
 * Chuẩn hoá ảnh chữ ký trước khi nhúng: tô mực xanh + ÉP NỀN TRẮNG.
 *
 * Chữ ký trong hồ sơ là PNG có KÊNH TRONG SUỐT (nét chữ trên nền rỗng). Rất nhiều trình
 * xem PDF và gần như mọi máy in dựng vùng trong suốt thành ĐEN — in ra là một ô đen sì
 * đè lên cột chữ ký, tưởng hỏng cả quyển sổ.
 *
 * Ảnh lỗi thì trả lại nguyên bản: thà chữ ký hiển thị chưa chuẩn còn hơn mất chữ ký.
 */
export async function signatureInk(buffer: Buffer): Promise<Buffer> {
  try {
    // Làm việc trên RGBA thô: cần chính kênh alpha để biết đâu là nét, đâu là nền.
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height * 3);
    for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
      const alpha = data[i + 3] / 255;
      // Độ sáng của điểm ảnh gốc giữ lại phần đậm/nhạt (nét mảnh ở rìa nhạt hơn),
      // nếu ép cứng một màu thì chữ ký trông như hình vẽ vector, mất nét bút.
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const k = 1 - lum * 0.35;
      out[o] = Math.round(255 + (INK.r * k - 255) * alpha);
      out[o + 1] = Math.round(255 + (INK.g * k - 255) * alpha);
      out[o + 2] = Math.round(255 + (INK.b * k - 255) * alpha);
    }
    return await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    try {
      return await sharp(buffer).flatten({ background: "#ffffff" }).png({ compressionLevel: 9 }).toBuffer();
    } catch {
      return buffer;
    }
  }
}
