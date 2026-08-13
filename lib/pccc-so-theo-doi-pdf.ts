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
 *  - Ảnh chữ ký phải ÉP NỀN TRẮNG và TÔ LẠI THÀNH MỰC XANH trước khi nhúng
 *    (xem `flattenSignature`).
 */
import { PDFDocument, StandardFonts, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { BookRow } from "@/lib/pccc-so-theo-doi";
import {
  BLACK,
  CONTENT_W,
  FS,
  MARGIN,
  PAGE,
  drawCell,
  drawCentered,
  fmtDate,
  loadPdfFonts,
  rect,
  signatureInk,
  type PdfFonts,
} from "@/lib/pccc-pdf-kit";

/** Bề rộng cột, cộng lại đúng bằng bề rộng vùng nội dung. 8 cột theo Mẫu số 01. */
const COLS = [32, 222, 44, 44, 92, 106, 106, 116] as const;
const HEADERS = [
  "STT",
  "Tên phương tiện",
  "ĐVT",
  "Số lượng",
  "Thời gian kiểm tra, bảo dưỡng",
  "Đánh giá tình trạng hoạt động",
  "Người được phân công quản lý",
  "Ghi chú",
] as const;

/** Cột "Người được phân công quản lý" — nơi đặt ảnh chữ ký. */
const SIGN_COL = 6;

/**
 * Đủ cao cho ảnh chữ ký NẰM TRÊN họ tên hai dòng — họ tên Việt dài, ép một dòng là cụt.
 * 46pt là mức đã cân: chữ ký đọc được rõ mà mỗi trang vẫn giữ được ~9 dòng.
 */
const ROW_H = 46;

export type BookPdfInput = {
  periodLabel: string;
  positionLabel: string;
  rows: BookRow[];
  /** Ảnh chữ ký theo S3 key (đã tải sẵn ở lớp gọi) — thiếu ảnh thì cột 7 chỉ còn tên. */
  signatureImages: Map<string, Buffer>;
  /** Năm in trên trang bìa; mặc định lấy từ nhãn kỳ. */
  year?: string;
};

/** Trang bìa — bám nguyên văn bản mẫu, chỉ thay hai chỗ có dữ liệu. */
function drawCover(page: PDFPage, fonts: PdfFonts, input: BookPdfInput, year: string) {
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
function drawTableHeader(page: PDFPage, fonts: PdfFonts, withTitle: boolean) {
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
    if (i === SIGN_COL) {
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
  const fonts = await loadPdfFonts(pdf);
  pdf.setTitle(`So theo doi phuong tien PCCC - ${input.positionLabel} - ${input.periodLabel}`);
  // Phông chuẩn chỉ để pdf-lib khỏi tự nhúng Helvetica khi tài liệu rỗng; không vẽ chữ Việt bằng nó.
  await pdf.embedFont(StandardFonts.Helvetica);

  drawCover(pdf.addPage([PAGE.w, PAGE.h]), fonts, input, year);

  // Ảnh chữ ký nhúng MỘT LẦN cho mỗi key rồi dùng lại ở mọi dòng: cả cương vị thường
  // chỉ một người ký, nhúng theo dòng là phình tệp lên hàng chục MB.
  const embedded = new Map<string, PDFImage>();
  for (const [key, buffer] of input.signatureImages) {
    const flat = await signatureInk(buffer);
    try {
      embedded.set(key, await pdf.embedPng(flat));
    } catch {
      try {
        embedded.set(key, await pdf.embedJpg(flat));
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
    // Cột 7 (chữ ký) vẽ riêng bên dưới vì có ảnh; các cột còn lại chỉ là chữ.
    const cells: Record<number, string> = {
      0: String(stt),
      1: `${row.ten} ${row.ma}`.trim(),
      2: row.dvt,
      3: row.sl === null || row.sl === undefined ? "" : String(row.sl),
      4: fmtDate(row.ngayKiemTra),
      5: row.tinhTrang,
      7: row.ghiChu,
    };
    let x = MARGIN;
    COLS.forEach((w, i) => {
      rect(page, x, top, w, ROW_H);
      if (i in cells) {
        // Ghi chú là câu mô tả hỏng hóc, dài hơn hẳn các ô khác — cho chữ nhỏ hơn và
        // thêm một dòng để không bị cắt cụt mất phần "cần thay mới".
        const isNote = i === 7;
        // Cột "Tên phương tiện" gồm tên + MÃ THIẾT BỊ, mà mã nằm ở cuối chuỗi: bó 2 dòng
        // là tên tủ dài nuốt mất mã, sổ in ra không tra được thiết bị nào.
        const isName = i === 1;
        drawCell(page, cells[i], {
          x,
          y: top,
          w,
          h: ROW_H,
          font: fonts.regular,
          size: isNote ? FS.small : FS.body,
          // Ghi chú CĂN GIỮA như các cột số liệu khác (drawCell đã căn giữa theo chiều
          // dọc sẵn); chỉ cột "Tên phương tiện" căn trái vì là chuỗi dài nhiều dòng.
          align: isName ? "left" : "center",
          maxLines: isName || isNote ? 3 : 2,
        });
      }
      x += w;
    });

    // Cột 7: ảnh chữ ký nằm trên, họ tên nằm dưới — đúng "Ký, ghi rõ họ tên".
    const signX = MARGIN + COLS.slice(0, SIGN_COL).reduce((a, b) => a + b, 0);
    const signW = COLS[SIGN_COL];
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
