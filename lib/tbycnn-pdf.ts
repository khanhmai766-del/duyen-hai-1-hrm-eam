/**
 * Dựng PDF sổ TBYCNN — bám đúng bản in của ứng dụng rời (README mục 6.9): khổ A4 NGANG,
 * bảng gộp theo danh mục La Mã, in ĐẦY ĐỦ nội dung, cuối trang có khối ký tên
 * "Vĩnh Long, ngày dd tháng mm năm yyyy".
 *
 * KHÁC bản cũ ở chỗ dựng Ở SERVER bằng pdf-lib thay vì `window.open()` + `window.print()`:
 *  - Bản cũ phụ thuộc hộp thoại in của từng trình duyệt, mỗi máy ra một kiểu lề/cỡ chữ,
 *    và Safari/iOS thì gần như không dùng được.
 *  - Dựng ở server thì mọi người tải về đúng một bản giống nhau, và đóng được chữ ký số
 *    vào — thứ bản cũ không có.
 *
 * Ràng buộc kế thừa từ `lib/pccc-pdf-kit.ts`, đừng sửa nếu chưa đọc phần đầu file đó:
 * phông PHẢI nhúng từ `assets/fonts` (phông có sẵn của PDF là WinAnsi, gặp chữ Việt có
 * dấu là NÉM LỖI), và ảnh chữ ký phải qua `signatureInk` (nền trong suốt in ra thành ô đen).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  BLACK,
  CONTENT_W,
  FS,
  MARGIN,
  PAGE,
  drawCell,
  drawCentered,
  loadPdfFonts,
  rect,
  signatureInk,
  wrap,
  type PdfFonts,
} from "@/lib/pccc-pdf-kit";
import { computeTinhTrang, displayKdDate } from "@/lib/tbycnn";

/**
 * 16 cột đúng mảng `COLUMNS` của bản cũ. Bề rộng cộng lại BẰNG ĐÚNG `CONTENT_W` (762pt) —
 * lệch một chút là đường kẻ dọc cuối bảng rơi ra ngoài lề.
 *
 * Chia chỗ theo nội dung thật của 709 dòng chứ không chia đều: "Thông số kỹ thuật" là
 * đoạn văn nhiều dòng nên lấy phần rộng nhất, còn "TT"/"SL"/"Chu kỳ" chỉ chứa 1–2 chữ số.
 */
const COLS: { key: string; label: string; w: number; align?: "center" }[] = [
  { key: "tt", label: "TT", w: 18, align: "center" },
  { key: "tenThietBi", label: "Tên TBYCNN", w: 76 },
  { key: "soLuong", label: "SL", w: 16, align: "center" },
  { key: "maHieu", label: "Mã hiệu", w: 58 },
  { key: "kks", label: "KKS", w: 46 },
  { key: "thongSoKyThuat", label: "Thông số kỹ thuật", w: 116 },
  { key: "viTri", label: "Vị trí", w: 54 },
  { key: "chucDanhQuanLy", label: "Chức danh quản lý", w: 48 },
  { key: "chuKyThu", label: "Chu kỳ thử (năm)", w: 22, align: "center" },
  { key: "kdGanNhat", label: "Thời gian KĐ gần nhất", w: 40, align: "center" },
  { key: "soBbkd", label: "Số BBKĐ", w: 42 },
  { key: "donViKd", label: "Đơn vị KĐ", w: 54 },
  { key: "kdTiepTheo", label: "Thời gian KĐ tiếp theo", w: 40, align: "center" },
  { key: "khiemKhuyet", label: "Khiếm khuyết", w: 50 },
  { key: "tinhTrang", label: "Tình trạng", w: 38, align: "center" },
  { key: "ghiChu", label: "Ghi chú", w: 44 },
];

const FS_BODY = 6.5;
const FS_HEAD = 6.5;
/**
 * Trần số dòng trong một ô — đặt ĐỦ CAO để không ô nào bị cắt.
 *
 * `wrap()` vượt trần là cắt bớt và chèn dấu "…". Bản in này là hồ sơ kiểm định, mục 6.9
 * của bản cũ nói rõ PDF "luôn in đầy đủ nội dung" — mất chữ ở đây là mất dữ liệu. Ô dài
 * nhất trong 709 dòng của kỳ đầu là "Ghi chú" — cần 22 dòng ở bề rộng cột hiện tại (đo
 * bằng chính phông sẽ dùng để in, không ước lượng theo số ký tự). Để 24 cho dư.
 *
 * Hàng cao 24 dòng ≈ 199pt, vẫn lọt trong vùng nội dung ~436pt của A4 ngang nên không có
 * hàng nào tràn khỏi trang.
 */
const MAX_LINES = 24;
const LINE_H = FS_BODY + 1.6;
const CELL_PAD = 3;
const HEADER_H = 34;
const GROUP_H = 13;

export type TbycnnPdfRow = {
  tt: number | null;
  tenThietBi: string;
  soLuong: number | null;
  maHieu: string | null;
  kks: string | null;
  thongSoKyThuat: string | null;
  viTri: string | null;
  chucDanhQuanLy: string | null;
  donViQuanLy: string | null;
  chuKyThu: number | null;
  kdGanNhat: Date | null;
  kdGanNhatText: string | null;
  soBbkd: string | null;
  donViKd: string | null;
  kdTiepTheo: Date | null;
  kdTiepTheoText: string | null;
  khiemKhuyet: string | null;
  soLuongKhaDung: number | null;
  soLuongKhongKhaDung: number | null;
  ghiChu: string | null;
  khuVuc: string;
  cuongVi: string | null;
  machine: string;
  nhom: string;
  signature: { signerName: string; signerPosition: string | null; signatureKey: string | null } | null;
};

export type TbycnnPdfInput = {
  periodLabel: string;
  /** Nhãn phạm vi in ra dưới tiêu đề: cương vị + tổ máy, hoặc "Toàn phân xưởng". */
  scopeLabel: string;
  rows: TbycnnPdfRow[];
  /** Ảnh chữ ký lấy từ S3, khoá là `signatureKey`. */
  signatureImages: Map<string, Buffer>;
};

function cellText(row: TbycnnPdfRow, key: string): string {
  switch (key) {
    case "kdGanNhat":
      return displayKdDate(row.kdGanNhat, row.kdGanNhatText);
    case "kdTiepTheo":
      return displayKdDate(row.kdTiepTheo, row.kdTiepTheoText);
    case "tinhTrang":
      return computeTinhTrang(row.soLuongKhaDung, row.soLuongKhongKhaDung);
    default: {
      const v = (row as unknown as Record<string, unknown>)[key];
      return v == null ? "" : String(v);
    }
  }
}

/** Chiều cao hàng = ô cần nhiều dòng nhất. Bản cũ cũng in đủ nội dung, không cắt. */
function rowHeight(row: TbycnnPdfRow, fonts: PdfFonts): number {
  let lines = 1;
  for (const col of COLS) {
    const n = wrap(cellText(row, col.key), fonts.regular, FS_BODY, col.w - CELL_PAD * 2, MAX_LINES).length;
    if (n > lines) lines = n;
  }
  return Math.max(14, lines * LINE_H + 5);
}

function drawPageHeader(page: PDFPage, fonts: PdfFonts, input: TbycnnPdfInput): number {
  let y = PAGE.h - MARGIN;
  drawCentered(page, "THIẾT BỊ YÊU CẦU NGHIÊM NGẶT VỀ AN TOÀN LAO ĐỘNG", fonts.bold, FS.title, y - FS.title);
  y -= FS.title + 6;
  drawCentered(page, `${input.scopeLabel} · Kỳ ${input.periodLabel}`, fonts.regular, FS.sub, y - FS.sub);
  return y - FS.sub - 10;
}

/** Đầu bảng VẼ LẠI Ở MỖI TRANG — bản in đóng thành tập, lật giữa chừng phải tra được cột. */
function drawTableHeader(page: PDFPage, fonts: PdfFonts, top: number): number {
  const y = top - HEADER_H;
  let x = MARGIN;
  for (const col of COLS) {
    rect(page, x, y, col.w, HEADER_H);
    drawCell(page, col.label, {
      x,
      y,
      w: col.w,
      h: HEADER_H,
      font: fonts.bold,
      size: FS_HEAD,
      align: "center",
      maxLines: 4,
    });
    x += col.w;
  }
  return y;
}

/** Khối ký tên cuối sổ — giữ đúng bản cũ, thêm chữ ký số nếu cả phạm vi do một người ký. */
function drawSignatureBlock(
  page: PDFPage,
  fonts: PdfFonts,
  top: number,
  signer: { name: string; position: string | null; image?: PDFImage } | null
) {
  const now = new Date();
  const dateLine = `Vĩnh Long, ngày ${String(now.getDate()).padStart(2, "0")} tháng ${String(
    now.getMonth() + 1
  ).padStart(2, "0")} năm ${now.getFullYear()}`;

  // Khối nằm ở NỬA PHẢI trang, đúng lối trình bày văn bản hành chính.
  const blockW = 240;
  const x = PAGE.w - MARGIN - blockW;
  let y = top - 18;

  const center = (text: string, font: typeof fonts.regular, size: number) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: x + (blockW - w) / 2, y, size, font, color: BLACK });
  };

  center(dateLine, fonts.regular, FS.body);
  y -= FS.body + 6;
  center("NGƯỜI LẬP BIỂU", fonts.bold, FS.body);
  y -= FS.body + 2;
  center("(Ký, ghi rõ họ tên)", fonts.regular, FS.small);
  y -= 52;

  if (signer?.image) {
    const h = 40;
    const w = (signer.image.width / signer.image.height) * h;
    page.drawImage(signer.image, { x: x + (blockW - w) / 2, y: y + 6, width: w, height: h });
  }
  if (signer) {
    center(signer.name, fonts.bold, FS.body);
  }
}

/* ══════════════════════ TRANG BÌA (Biểu mẫu 2) ══════════════════════ */

/** Hai màu của bộ nhận diện EVNGENCO1 — chữ "EVN" xanh, "GENCO1" đỏ. */
const EVN_BLUE = rgb(0.106, 0.294, 0.573);
const EVN_RED = rgb(0.847, 0.106, 0.145);

/**
 * Kẻ dòng chấm để điền tay, bắt đầu ngay sau nhãn.
 *
 * Dùng chuỗi dấu chấm chứ không phải nét đứt vẽ bằng `drawLine`: bản mẫu giấy là dấu
 * chấm, và chấm theo phông thì giãn cách khớp với chữ nhãn đứng cạnh.
 */
function dottedField(
  page: PDFPage,
  label: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  width: number
) {
  page.drawText(label, { x, y, size, font, color: BLACK });
  const labelW = font.widthOfTextAtSize(label + " ", size);
  const dotW = font.widthOfTextAtSize(".", size);
  const count = Math.max(0, Math.floor((width - labelW) / dotW));
  if (count > 0) {
    page.drawText(".".repeat(count), { x: x + labelW, y, size, font, color: BLACK });
  }
}

/**
 * Trang bìa đứng TRƯỚC mọi trang bảng, dựng theo Biểu mẫu 2 của quy trình ATLĐ.
 *
 * Ba chỗ cố ý làm khác cho tiện in ấn, đừng "sửa lại cho giống mẫu" nếu chưa hỏi:
 *
 *  - Khổ giấy giữ A4 NGANG như các trang bảng. Bản mẫu là khổ dọc, nhưng trộn hai chiều
 *    giấy trong một tệp thì máy in hai mặt xoay trang bìa lung tung và kẹp tài liệu lệch.
 *  - Ba dòng "Chức danh QLVH / Người phụ trách / Vĩnh Long, ngày…" để TRỐNG đúng như bản
 *    mẫu — sổ in ra là để ký tay, điền sẵn tên theo phạm vi lọc dễ ghi nhầm người.
 *  - Chữ "EVNGENCO1" vẽ bằng phông chứ không nhúng ảnh: kho ảnh chỉ có bản lô-gô ngang
 *    kèm sẵn dòng "TỔNG CÔNG TY PHÁT ĐIỆN 1", không xếp chồng được như bản mẫu.
 */
async function drawCoverPage(pdf: PDFDocument, fonts: PdfFonts) {
  const page = pdf.insertPage(0, [PAGE.w, PAGE.h]);
  const mid = PAGE.w / 2;

  // Khung viền đôi.
  rect(page, 28, 28, PAGE.w - 56, PAGE.h - 56);
  rect(page, 34, 34, PAGE.w - 68, PAGE.h - 68);

  drawCentered(page, "TỔNG CÔNG TY PHÁT ĐIỆN 1", fonts.regular, 12, 505);
  drawCentered(page, "CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI", fonts.bold, 13.5, 485);

  // Ngôi sao EVNGENCO1. Thiếu tệp ảnh thì bỏ qua phần lô-gô chứ KHÔNG hỏng cả bản in —
  // sổ không có lô-gô vẫn dùng được, sổ không xuất được thì không.
  let wordmarkY = 451;
  try {
    const star = await pdf.embedPng(
      await fs.readFile(path.join(process.cwd(), "public", "brand", "4.png"))
    );
    const h = 74;
    const w = (star.width / star.height) * h;
    page.drawImage(star, { x: mid - w / 2, y: 475 - h, width: w, height: h });
    wordmarkY = 475 - h - 20;
  } catch {
    // không có lô-gô — chữ EVNGENCO1 dâng lên lấp chỗ
  }

  // "EVNGENCO1" hai màu: đo bề rộng từng nửa rồi đặt sao cho cả cụm nằm giữa trang.
  const wmSize = 20;
  const wEvn = fonts.bold.widthOfTextAtSize("EVN", wmSize);
  const wGenco = fonts.bold.widthOfTextAtSize("GENCO1", wmSize);
  const wmX = mid - (wEvn + wGenco) / 2;
  page.drawText("EVN", { x: wmX, y: wordmarkY, size: wmSize, font: fonts.bold, color: EVN_BLUE });
  page.drawText("GENCO1", {
    x: wmX + wEvn,
    y: wordmarkY,
    size: wmSize,
    font: fonts.bold,
    color: EVN_RED,
  });

  drawCentered(page, "SỔ THEO DÕI THIẾT BỊ CÓ YÊU CẦU", fonts.bold, 23, 313);
  drawCentered(page, "NGHIÊM NGẶT AN TOÀN LAO ĐỘNG", fonts.bold, 23, 281);

  drawCentered(page, "Tên đơn vị: PHÂN XƯỞNG VẬN HÀNH 1", fonts.bold, 13, 229);

  // Khối điền tay thụt vào cho cân với khối tiêu đề ở trên.
  const fieldX = MARGIN + 110;
  const fieldW = CONTENT_W - 220;
  dottedField(page, "Chức danh QLVH:", fonts.regular, 12, fieldX, 183, fieldW);
  dottedField(page, "Người phụ trách tại cơ sở:", fonts.regular, 12, fieldX, 155, fieldW);

  drawCentered(page, "Vĩnh Long, ngày …… tháng …… năm 20……", fonts.regular, 12, 91);
}

export async function buildTbycnnPdf(input: TbycnnPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await loadPdfFonts(pdf);

  // Trang bìa dựng SAU CÙNG bằng `insertPage(0, …)` chứ không dựng trước: vòng vẽ bảng
  // bên dưới đánh dấu trang hiện hành bằng `pdf.addPage()` nối đuôi, nếu bìa nằm sẵn ở
  // đầu thì mọi phép đếm trang của nó đều lệch một.

  // Nhúng trước từng ảnh chữ ký một lần, dùng lại cho mọi trang.
  const embedded = new Map<string, PDFImage>();
  for (const [key, buffer] of input.signatureImages) {
    try {
      embedded.set(key, await pdf.embedPng(await signatureInk(buffer)));
    } catch {
      // Ảnh hỏng thì bỏ qua, không chặn cả bản in.
    }
  }

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = drawTableHeader(page, fonts, drawPageHeader(page, fonts, input));

  const newPage = () => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = drawTableHeader(page, fonts, drawPageHeader(page, fonts, input));
  };

  // Dòng tiêu đề nhóm chèn lại mỗi khi (cương vị, danh mục La Mã) đổi — giống hệt cách
  // bản cũ và file Excel gốc trình bày.
  let lastGroup = "";
  for (const row of input.rows) {
    const group = `${row.khuVuc} — ${row.nhom}`;
    const h = rowHeight(row, fonts);
    const needed = (group !== lastGroup ? GROUP_H : 0) + h;
    if (y - needed < MARGIN + 12) newPage();

    if (group !== lastGroup) {
      rect(page, MARGIN, y - GROUP_H, CONTENT_W, GROUP_H);
      drawCell(page, group, {
        x: MARGIN,
        y: y - GROUP_H,
        w: CONTENT_W,
        h: GROUP_H,
        font: fonts.bold,
        size: FS_BODY,
        maxLines: 1,
      });
      y -= GROUP_H;
      lastGroup = group;
    }

    let x = MARGIN;
    for (const col of COLS) {
      rect(page, x, y - h, col.w, h);
      drawCell(page, cellText(row, col.key), {
        x,
        y: y - h,
        w: col.w,
        h,
        font: fonts.regular,
        size: FS_BODY,
        align: col.align,
        maxLines: MAX_LINES,
      });
      x += col.w;
    }
    y -= h;
  }

  // Chỉ đóng chữ ký khi CẢ phạm vi in do đúng MỘT người ký. Nhiều người ký mà in một
  // cái tên là nói sai ai đã kiểm tra phần nào — lúc đó để trống cho ký tay.
  const signers = new Map<string, { name: string; position: string | null; key: string | null }>();
  for (const row of input.rows) {
    if (!row.signature) continue;
    signers.set(row.signature.signerName, {
      name: row.signature.signerName,
      position: row.signature.signerPosition,
      key: row.signature.signatureKey,
    });
  }
  const onlySigner = signers.size === 1 ? [...signers.values()][0] : null;

  if (y < MARGIN + 130) newPage();
  drawSignatureBlock(
    page,
    fonts,
    y,
    onlySigner
      ? {
          name: onlySigner.name,
          position: onlySigner.position,
          image: onlySigner.key ? embedded.get(onlySigner.key) : undefined,
        }
      : null
  );

  await drawCoverPage(pdf, fonts);

  return Buffer.from(await pdf.save());
}
