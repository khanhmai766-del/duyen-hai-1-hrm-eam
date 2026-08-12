/**
 * Dựng PDF "SỔ THEO DÕI PHƯƠNG TIỆN PCCC — Mẫu số 01" bám đúng bản mẫu giấy:
 * trang bìa, rồi BẢNG II kẻ ô, cuối cùng là khối Ghi chú.
 *
 * Vài ràng buộc đã trả giá mới biết, đừng sửa nếu chưa đọc:
 *
 *  - PHÔNG CHỮ phải nhúng từ tệp trong repo (`assets/fonts`). 14 phông có sẵn của PDF
 *    đều là WinAnsi — chữ Việt có dấu sẽ NÉM LỖI khi vẽ, không phải chỉ hiện sai. Máy
 *    dev Windows và server Linux không chung bộ phông hệ thống nên không đọc phông máy.
 *  - Số thứ tự chạy LIÊN TỤC từ 1 xuyên hai bảng (hết bình chữa cháy mới tới tủ), đúng
 *    yêu cầu nghiệp vụ — không đánh số lại theo từng bảng.
 *  - Đầu bảng (2 tầng: tên cột + số cột 1..7) VẼ LẠI Ở MỖI TRANG, vì bản in đóng thành
 *    quyển, người đọc lật giữa chừng không có gì để tra cột.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { BookRow } from "@/lib/pccc-so-theo-doi";

/** A4 NGANG. Bảng có 7 cột, cột "Tên phương tiện" cần rất rộng — khổ dọc là vỡ bảng. */
const PAGE = { w: 842, h: 595 };
const MARGIN = 40;
const CONTENT_W = PAGE.w - MARGIN * 2;

/** Bề rộng cột, cộng lại đúng bằng bề rộng vùng nội dung. */
const COLS = [40, 285, 60, 55, 105, 110, 107] as const;
const HEADERS = [
  "STT",
  "Tên phương tiện",
  "Đơn vị tính",
  "Số lượng",
  "Thời gian kiểm tra, bảo quản, bảo dưỡng",
  "Đánh giá tình trạng hoạt động",
  "Người được phân công quản lý",
] as const;

const BLACK = rgb(0, 0, 0);
const LINE = 0.8;
const FS = { title: 13, sub: 11, body: 9, small: 8 };
/** Đủ cao cho ảnh chữ ký NẰM TRÊN họ tên hai dòng — họ tên Việt dài, ép một dòng là cụt. */
const ROW_H = 38;

export type BookPdfInput = {
  periodLabel: string;
  positionLabel: string;
  rows: BookRow[];
  /** Ảnh chữ ký theo S3 key (đã tải sẵn ở lớp gọi) — thiếu ảnh thì cột 7 chỉ còn tên. */
  signatureImages: Map<string, Buffer>;
  /** Năm in trên trang bìa; mặc định lấy từ nhãn kỳ. */
  year?: string;
};

async function loadFonts(pdf: PDFDocument) {
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
    throw new Error(
      "Thiếu phông chữ để dựng PDF (assets/fonts/DejaVuSerif.ttf). Kiểm tra lại bản triển khai."
    );
  }
}

/** Cắt chuỗi thành nhiều dòng vừa bề rộng ô. Cắt theo TỪ, từ nào dài quá thì cắt cứng. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 3): string[] {
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

function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, y: number) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE.w - w) / 2, y, size, font, color: BLACK });
}

/** Vẽ chữ trong ô, canh trái/giữa và canh giữa theo chiều dọc của ô. */
function drawCell(
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

function rect(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: BLACK, borderWidth: LINE });
}

function fmtDate(value: Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Trang bìa — bám nguyên văn bản mẫu, chỉ thay hai chỗ có dữ liệu. */
function drawCover(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, input: BookPdfInput, year: string) {
  const boxX = MARGIN;
  const boxY = 150;
  const boxW = CONTENT_W;
  const boxH = PAGE.h - boxY - MARGIN;
  rect(page, boxX, boxY, boxW, boxH);

  let y = boxY + boxH - 34;
  page.drawText("Trang bìa", { x: boxX + 14, y, size: FS.sub, font: fonts.regular, color: BLACK });
  drawCentered(page, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", fonts.bold, FS.sub, y);
  const mauW = fonts.bold.widthOfTextAtSize("Mẫu số 01", FS.sub);
  page.drawText("Mẫu số 01", { x: boxX + boxW - 14 - mauW, y, size: FS.sub, font: fonts.bold, color: BLACK });

  y -= 16;
  drawCentered(page, "Độc lập - Tự do - Hạnh phúc", fonts.bold, FS.sub, y);
  y -= 14;
  drawCentered(page, "---------------", fonts.regular, FS.sub, y);

  y -= 46;
  drawCentered(page, "SỔ THEO DÕI PHƯƠNG TIỆN", fonts.bold, FS.title, y);
  y -= 22;
  drawCentered(page, "PHÒNG CHÁY, CHỮA CHÁY, CỨU NẠN, CỨU HỘ", fonts.bold, FS.title, y);
  y -= 22;
  drawCentered(page, "CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI", fonts.bold, FS.title, y);
  y -= 24;
  drawCentered(page, `(Năm ${year})`, fonts.bold, FS.sub, y);

  y -= 34;
  const lines = [
    `Tên cơ sở: KHU VỰC ${input.positionLabel.toUpperCase()} - PX VẬN HÀNH 1 - NHÀ MÁY NHIỆT ĐIỆN DUYÊN HẢI 1`,
    "Địa chỉ: Khóm Mù U, phường Duyên Hải, tỉnh Vĩnh Long",
    "Số điện thoại: (+84) 0294 3923222    Fax: (+84) 0294 3923243",
    `Lập sổ ngày 01 tháng 04 năm ${year}`,
    "Người lập sổ: NGUYỄN QUANG ĐÀM – KTV PXVH1",
    `Người được phân công quản lý phương tiện phòng cháy, chữa cháy, cứu nạn, cứu hộ: ${input.positionLabel}`,
  ];
  for (const line of lines) {
    page.drawText(line, { x: boxX + 14, y, size: FS.sub, font: fonts.regular, color: BLACK });
    y -= 24;
  }
}

/** Tiêu đề BẢNG II + đầu bảng 2 tầng. Trả về mép dưới của đầu bảng để vẽ tiếp dữ liệu. */
function drawTableHeader(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, withTitle: boolean) {
  let y = PAGE.h - MARGIN;
  if (withTitle) {
    drawCentered(page, "BẢNG II", fonts.bold, FS.title, y - 10);
    y -= 34;
    const title = [
      "BÌNH CHỮA CHÁY CÁC LOẠI, THIẾT BỊ BÁO CHÁY ĐỘC LẬP, THIẾT BỊ THUỘC HỆ THỐNG BÁO CHÁY,",
      "THIẾT BỊ THUỘC HỆ THỐNG LOA THÔNG BÁO VÀ HƯỚNG DẪN THOÁT NẠN, THIẾT BỊ THUỘC HỆ THỐNG",
      "CHỮA CHÁY, ĐÈN, PHƯƠNG TIỆN CHIẾU SÁNG SỰ CỐ, CHỈ DẪN THOÁT NẠN",
    ];
    for (const line of title) {
      drawCentered(page, line, fonts.bold, FS.body, y);
      y -= 14;
    }
    y -= 12;
  } else {
    y -= 10;
  }

  const headH = 44;
  const numH = 16;
  let x = MARGIN;
  COLS.forEach((w, i) => {
    rect(page, x, y - headH, w, headH);
    if (i === COLS.length - 1) {
      // Cột 7 của bản mẫu có thêm dòng phụ "(Ký, ghi rõ họ tên)" — dòng này chính là chỗ
      // giải thích vì sao ô bên dưới có ảnh chữ ký, bỏ đi là lệch mẫu.
      drawCell(page, HEADERS[i], { x, y: y - headH + 12, w, h: headH - 12, font: fonts.bold, size: FS.small, align: "center" });
      drawCell(page, "(Ký, ghi rõ họ tên)", { x, y: y - headH, w, h: 12, font: fonts.regular, size: 7, align: "center", maxLines: 1 });
    } else {
      drawCell(page, HEADERS[i], { x, y: y - headH, w, h: headH, font: fonts.bold, size: FS.small, align: "center" });
    }
    x += w;
  });
  // Tầng số cột 1..7 của bản mẫu — cơ quan PCCC đối chiếu theo số cột này.
  x = MARGIN;
  COLS.forEach((w, i) => {
    rect(page, x, y - headH - numH, w, numH);
    drawCell(page, String(i + 1), { x, y: y - headH - numH, w, h: numH, font: fonts.regular, size: FS.small, align: "center" });
    x += w;
  });
  return y - headH - numH;
}

export async function buildPcccBookPdf(input: BookPdfInput): Promise<Buffer> {
  const year = input.year ?? input.periodLabel.split(".")[1] ?? String(new Date().getFullYear());
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await loadFonts(pdf);
  pdf.setTitle(`So theo doi phuong tien PCCC - ${input.positionLabel} - ${input.periodLabel}`);
  // Phông chuẩn chỉ để pdf-lib khỏi tự nhúng Helvetica khi tài liệu rỗng; không vẽ chữ Việt bằng nó.
  await pdf.embedFont(StandardFonts.Helvetica);

  drawCover(pdf.addPage([PAGE.w, PAGE.h]), fonts, input, year);

  // Ảnh chữ ký nhúng MỘT LẦN cho mỗi key rồi dùng lại ở mọi dòng: cả cương vị thường
  // chỉ một người ký, nhúng theo dòng là phình tệp lên hàng chục MB.
  const embedded = new Map<string, PDFImage>();
  for (const [key, buffer] of input.signatureImages) {
    try {
      embedded.set(key, await pdf.embedPng(buffer));
    } catch {
      try {
        embedded.set(key, await pdf.embedJpg(buffer));
      } catch {
        // Ảnh hỏng thì bỏ qua — cột 7 vẫn còn họ tên, không được làm hỏng cả quyển sổ.
      }
    }
  }

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = drawTableHeader(page, fonts, true);
  let stt = 0;

  for (const row of input.rows) {
    if (y - ROW_H < MARGIN) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = drawTableHeader(page, fonts, false);
    }
    stt += 1;
    const top = y - ROW_H;
    const cells = [
      String(stt),
      `${row.ten} ${row.ma}`.trim(),
      row.dvt,
      row.sl === null || row.sl === undefined ? "" : String(row.sl),
      fmtDate(row.ngayKiemTra),
      row.tinhTrang,
    ];
    let x = MARGIN;
    COLS.forEach((w, i) => {
      rect(page, x, top, w, ROW_H);
      if (i < cells.length) {
        drawCell(page, cells[i], {
          x,
          y: top,
          w,
          h: ROW_H,
          font: fonts.regular,
          size: FS.body,
          align: i === 1 ? "left" : "center",
          maxLines: 2,
        });
      }
      x += w;
    });

    // Cột 7: ảnh chữ ký nằm trên, họ tên nằm dưới — đúng "Ký, ghi rõ họ tên".
    const signX = MARGIN + COLS.slice(0, 6).reduce((a, b) => a + b, 0);
    const signW = COLS[6];
    const image = row.signatureKey ? embedded.get(row.signatureKey) : undefined;
    if (image) {
      const nameH = 18;
      const maxW = signW - 8;
      const maxH = ROW_H - nameH - 4;
      const scale = Math.min(maxW / image.width, maxH / image.height);
      page.drawImage(image, {
        x: signX + (signW - image.width * scale) / 2,
        y: top + ROW_H - 2 - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      });
      drawCell(page, row.nguoiKiemTra, {
        x: signX,
        y: top + 1,
        w: signW,
        h: nameH,
        font: fonts.regular,
        size: 7,
        align: "center",
        maxLines: 2,
      });
    } else {
      drawCell(page, row.nguoiKiemTra, { x: signX, y: top, w: signW, h: ROW_H, font: fonts.regular, size: FS.small, align: "center", maxLines: 2 });
    }
    y = top;
  }

  // Khối Ghi chú của bản mẫu — in ở cuối, sang trang mới nếu không còn chỗ.
  const note = [
    "Ghi chú:",
    "- Bảng này sử dụng để theo dõi công tác bảo dưỡng đối với bình chữa cháy các loại, thiết bị báo cháy độc lập, thiết bị thuộc hệ thống báo cháy,",
    "thiết bị thuộc hệ thống loa thông báo và hướng dẫn thoát nạn, thiết bị thuộc hệ thống chữa cháy, đèn, phương tiện chiếu sáng sự cố, chỉ dẫn thoát nạn.",
    "- Cột 2: Ghi rõ tên bình chữa cháy, thiết bị thuộc hệ thống báo cháy, thiết bị thuộc hệ thống loa thông báo và hướng dẫn thoát nạn, thiết bị thuộc",
    "hệ thống chữa cháy, đèn chỉ dẫn thoát nạn, đèn chiếu sáng sự cố (quy định tại Phụ lục II) được trang bị tại đơn vị.",
  ];
  if (y - note.length * 14 - 20 < MARGIN) {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - MARGIN;
  }
  y -= 20;
  note.forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y, size: FS.small, font: i === 0 ? fonts.bold : fonts.regular, color: BLACK });
    y -= 13;
  });

  return Buffer.from(await pdf.save());
}
