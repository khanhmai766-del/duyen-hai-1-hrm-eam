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
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  BLACK,
  CONTENT_W,
  FS,
  LINE,
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
import { computeTinhTrang, displayKdDate, TBYCNN_NO_POSITION_LABEL, type TbycnnToolTab } from "@/lib/tbycnn";

/**
 * 16 cột đúng mảng `COLUMNS` của bản cũ. Bề rộng cộng lại BẰNG ĐÚNG `CONTENT_W` (762pt) —
 * lệch một chút là đường kẻ dọc cuối bảng rơi ra ngoài lề.
 *
 * Chia chỗ theo nội dung thật của 709 dòng chứ không chia đều: "Thông số kỹ thuật" là
 * đoạn văn nhiều dòng nên lấy phần rộng nhất, còn "TT"/"SL"/"Chu kỳ" chỉ chứa 1–2 chữ số.
 */
const MAIN_COLS: PdfCol[] = [
  { key: "tt", label: "TT", w: 18, align: "center" },
  { key: "tenThietBi", label: "Tên TBYCNN", w: 72 },
  { key: "soLuong", label: "SL", w: 16, align: "center" },
  { key: "maHieu", label: "Mã hiệu", w: 54 },
  { key: "kks", label: "KKS", w: 46 },
  { key: "thongSoKyThuat", label: "Thông số kỹ thuật", w: 86 },
  { key: "viTri", label: "Vị trí", w: 48 },
  { key: "chucDanhQuanLy", label: "Chức danh quản lý", w: 36 },
  { key: "chuKyThu", label: "Chu kỳ (tháng)", w: 36, align: "center" },
  // Hai cột ngày rộng 46pt để "19/05/2025" lọt gọn MỘT dòng: ngày kiểm định bị bẻ
  // thành "19/05/202" / "5" là thứ hội đồng đọc nhầm ngay.
  { key: "kdGanNhat", label: "Thời gian KĐ gần nhất", w: 46, align: "center" },
  { key: "soBbkd", label: "Số BBKĐ", w: 38 },
  { key: "donViKd", label: "Đơn vị KĐ", w: 46 },
  { key: "kdTiepTheo", label: "Thời gian KĐ tiếp theo", w: 46, align: "center" },
  { key: "khiemKhuyet", label: "Khiếm khuyết", w: 44 },
  { key: "tinhTrang", label: "Tình trạng", w: 38, align: "center" },
  { key: "ghiChu", label: "Ghi chú", w: 38 },
  // Cột cuối là CHỮ KÝ CỦA NGƯỜI ĐÃ KÝ XÁC NHẬN từng dòng (cương vị quản lý thiết bị đó),
  // KHÔNG dính dáng gì tới khối "Người lập biểu" ở cuối sổ — xem `drawSignatureBlock`.
  { key: "chuKy", label: "Chữ ký xác nhận", w: 54, align: "center" },
];

/** Bề rộng cộng lại phải BẰNG ĐÚNG `CONTENT_W`, lệch là đường kẻ dọc rơi ra ngoài lề. */
type PdfCol = { key: string; label: string; w: number; align?: "center" };

/**
 * Ba bảng dụng cụ ATLĐ in bằng ĐÚNG cột của biểu mẫu chúng (tải trọng thử, thời gian thử,
 * trị số cách điện…), không phải 17 cột của sổ chính — in bằng bộ cột chung thì nửa số cột
 * bỏ trống mà các số vừa đo lại không có chỗ nào để in.
 *
 * Bề rộng ở đây ghi theo TỈ LỆ mong muốn; `fitWidths` kéo cho tổng khớp CONTENT_W.
 */
function toolCols(tab: TbycnnToolTab): PdfCol[] {
  return fitWidths([
    { key: "tt", label: "TT", w: 20, align: "center" },
    { key: "tenThietBi", label: "Tên dụng cụ", w: 95 },
    { key: "maHieu", label: "Mã hiệu", w: 78 },
    ...tab.columns.map((col) => ({
      key: col.key,
      label: col.label,
      w: col.width * 0.42,
      ...(col.numeric ? { align: "center" as const } : {}),
    })),
    { key: "cuongVi", label: "Cương vị quản lý", w: 62 },
    { key: "chuKyThu", label: "Chu kỳ (tháng)", w: 34, align: "center" },
    { key: "kdTiepTheo", label: "Thời gian kiểm tra tiếp theo", w: 50, align: "center" },
    { key: "chuKy", label: "Chữ ký xác nhận", w: 58, align: "center" },
  ]);
}

/**
 * Kéo bề rộng cho tổng BẰNG ĐÚNG `CONTENT_W`: lệch một chút là đường kẻ dọc cuối bảng
 * rơi ra ngoài lề giấy. Chênh lệch sau khi làm tròn dồn vào cột RỘNG NHẤT — cột hẹp
 * (TT, Chu kỳ) mà bị cộng thêm vài pt thì nhìn ra ngay là bảng bị lệch.
 */
function fitWidths(cols: PdfCol[]): PdfCol[] {
  const raw = cols.reduce((sum, col) => sum + col.w, 0);
  const scaled = cols.map((col) => ({ ...col, w: Math.round((col.w / raw) * CONTENT_W) }));
  const drift = CONTENT_W - scaled.reduce((sum, col) => sum + col.w, 0);
  if (drift !== 0) {
    const widest = scaled.reduce((best, col) => (col.w > best.w ? col : best), scaled[0]);
    widest.w += drift;
  }
  // Cùng chốt kiểm với `MAIN_COLS`: thà ném lỗi lúc dựng còn hơn để đường kẻ dọc cuối
  // bảng lặng lẽ rơi ra ngoài lề giấy trên tập hồ sơ đã in.
  const total = scaled.reduce((sum, col) => sum + col.w, 0);
  if (total !== CONTENT_W) {
    throw new Error(`Bề rộng cột bảng dụng cụ cộng lại ${total}pt, phải bằng ${CONTENT_W}pt`);
  }
  return scaled;
}

/** Bộ cột của bản in: sổ chính giữ nguyên 17 cột đã căn tay, ba bảng dụng cụ theo biểu mẫu riêng.
 *  Xuất ra để đo lại số dòng gói chữ khi đổi bề rộng (xem docs/tbycnn.md mục 5b). */
export function colsFor(tab: TbycnnToolTab | null): PdfCol[] {
  return tab ? toolCols(tab) : MAIN_COLS;
}

const COLS_W = MAIN_COLS.reduce((sum, col) => sum + col.w, 0);
if (COLS_W !== CONTENT_W) {
  throw new Error(`Bề rộng cột sổ TBYCNN cộng lại ${COLS_W}pt, phải bằng ${CONTENT_W}pt`);
}

/* ── Nền các loại hàng. Bản in nộp hội đồng kiểm tra: đầu bảng và dòng nhóm phải
      nổi hẳn lên, còn thân bảng kẻ sọc RẤT nhạt để mắt lần theo hàng ngang giữa 17 cột
      mà không biến tờ giấy thành vằn vện. ── */
const HEAD_FILL = rgb(0.886, 0.918, 0.953);
const GROUP_FILL = rgb(0.937, 0.953, 0.973);
const ZEBRA_FILL = rgb(0.976, 0.98, 0.988);

/** Như `rect` của bộ dựng chung nhưng tô được nền. Giữ nguyên độ dày nét để cả hai sổ
    PCCC và TBYCNN in ra cùng một kiểu khung. */
function cellBox(page: PDFPage, x: number, y: number, w: number, h: number, fill?: RGB) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: BLACK, borderWidth: LINE });
}

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
  // Cột riêng của 3 bảng dụng cụ ATLĐ; null với mọi dòng của sổ chính.
  taiTrongThuKg: number | null;
  thoiGianThuPhut: number | null;
  tinhTrangSuDung: string | null;
  kiemTraBangMat: string | null;
  cachDienMOhm: number | null;
  ketQuaThu: string | null;
  nghiemThuSauSuaChua: string | null;
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
  /** Bảng dụng cụ đang in; null = sổ chính. Quyết định bộ cột của bản in. */
  toolTab?: TbycnnToolTab | null;
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
    case "cuongVi":
      return row.cuongVi || row.khuVuc || TBYCNN_NO_POSITION_LABEL;
    default: {
      const v = (row as unknown as Record<string, unknown>)[key];
      return v == null ? "" : String(v);
    }
  }
}

/** Chiều cao hàng = ô cần nhiều dòng nhất. Bản cũ cũng in đủ nội dung, không cắt. */
function rowHeight(row: TbycnnPdfRow, fonts: PdfFonts, cols: PdfCol[]): number {
  let lines = 1;
  for (const col of cols) {
    if (col.key === "chuKy") continue; // ô ảnh, không tính theo chữ
    const n = wrap(cellText(row, col.key), fonts.regular, FS_BODY, col.w - CELL_PAD * 2, MAX_LINES).length;
    if (n > lines) lines = n;
  }
  // Hàng đã ký phải cao tối thiểu SIG_ROW_H: nét ký bóp vào 14pt thì in ra chỉ còn một
  // vệt mực, hội đồng không đối chiếu được với chữ ký mẫu.
  const floor = row.signature ? SIG_ROW_H : 14;
  return Math.max(floor, lines * LINE_H + 5);
}

/** Chiều cao tối thiểu của hàng ĐÃ KÝ, đủ chỗ cho ảnh chữ ký + họ tên bên dưới. */
const SIG_ROW_H = 30;

/**
 * Ô "Chữ ký xác nhận" của MỘT DÒNG: ảnh chữ ký của người đã ký dòng đó, họ tên in nhỏ
 * bên dưới để hội đồng đối chiếu được mà không phải lật sang chỗ khác.
 *
 * Chưa ký thì để TRỐNG — ô trống là chỗ ký tay, còn in sẵn tên ai đó vào dòng chưa kiểm
 * tra là chứng nhận khống.
 */
function drawSignatureCell(
  page: PDFPage,
  fonts: PdfFonts,
  box: { x: number; y: number; w: number; h: number },
  signature: TbycnnPdfRow["signature"],
  image?: PDFImage
) {
  const name = signature?.signerName?.trim();
  if (!name) return;

  const nameSize = 5.2;
  const nameLines = wrap(name, fonts.regular, nameSize, box.w - 4, 2);
  const nameH = nameLines.length * (nameSize + 0.8);

  if (image) {
    const maxW = box.w - 6;
    const maxH = Math.max(6, Math.min(box.h - nameH - 5, 22));
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: box.x + (box.w - w) / 2,
      y: box.y + nameH + 2 + (box.h - nameH - 2 - h) / 2,
      width: w,
      height: h,
    });
  }

  let cursor = box.y + nameH - nameSize + 0.5;
  for (const line of nameLines) {
    const lineW = fonts.regular.widthOfTextAtSize(line, nameSize);
    page.drawText(line, {
      x: box.x + (box.w - lineW) / 2,
      y: cursor,
      size: nameSize,
      font: fonts.regular,
      color: BLACK,
    });
    cursor -= nameSize + 0.8;
  }
}

function drawPageHeader(page: PDFPage, fonts: PdfFonts, input: TbycnnPdfInput): number {
  let y = PAGE.h - MARGIN;
  drawCentered(page, "THIẾT BỊ YÊU CẦU NGHIÊM NGẶT VỀ AN TOÀN LAO ĐỘNG", fonts.bold, FS.title, y - FS.title);
  y -= FS.title + 6;
  drawCentered(page, `${input.scopeLabel} · Kỳ ${input.periodLabel}`, fonts.regular, FS.sub, y - FS.sub);
  return y - FS.sub - 10;
}

/** Đầu bảng VẼ LẠI Ở MỖI TRANG — bản in đóng thành tập, lật giữa chừng phải tra được cột. */
function drawTableHeader(page: PDFPage, fonts: PdfFonts, top: number, cols: PdfCol[]): number {
  const y = top - HEADER_H;
  let x = MARGIN;
  for (const col of cols) {
    cellBox(page, x, y, col.w, HEADER_H, HEAD_FILL);
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

/**
 * Khối ký cuối sổ — "NGƯỜI LẬP BIỂU", tức người TỔNG HỢP và in ra quyển sổ này.
 *
 * CỐ Ý ĐỂ TRỐNG cho ký tay. Đây KHÔNG phải chữ ký xác nhận kiểm tra: chữ ký xác nhận là
 * của từng cương vị quản lý cho từng dòng thiết bị và đã nằm ở cột cuối bảng
 * (`drawSignatureCell`). Trước đây khối này tự đóng chữ ký của người ký xác nhận khi cả
 * phạm vi in do một người ký — hai vai trò khác hẳn nhau, đóng nhầm là biến người đi
 * kiểm tra thành người lập biểu.
 */
function drawSignatureBlock(page: PDFPage, fonts: PdfFonts, top: number) {
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

  const cols = colsFor(input.toolTab ?? null);
  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = drawTableHeader(page, fonts, drawPageHeader(page, fonts, input), cols);

  const newPage = () => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = drawTableHeader(page, fonts, drawPageHeader(page, fonts, input), cols);
  };

  // Dòng tiêu đề nhóm chèn lại mỗi khi (cương vị, danh mục La Mã) đổi — giống hệt cách
  // bản cũ và file Excel gốc trình bày.
  let lastGroup = "";
  let zebra = false;
  for (const row of input.rows) {
    // Dòng hồ sơ để trống cương vị vẫn phải có tiêu đề nhóm đọc được, không phải một
    // dấu gạch ngang lửng lơ đầu trang in.
    const group = `${row.khuVuc || TBYCNN_NO_POSITION_LABEL} — ${row.nhom}`;
    const h = rowHeight(row, fonts, cols);
    const needed = (group !== lastGroup ? GROUP_H : 0) + h;
    if (y - needed < MARGIN + 12) newPage();

    if (group !== lastGroup) {
      cellBox(page, MARGIN, y - GROUP_H, CONTENT_W, GROUP_H, GROUP_FILL);
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
      // Mỗi nhóm bắt đầu lại từ hàng nền trắng, để sọc không nhảy lung tung giữa các nhóm.
      zebra = false;
    }

    let x = MARGIN;
    const fill = zebra ? ZEBRA_FILL : undefined;
    for (const col of cols) {
      cellBox(page, x, y - h, col.w, h, fill);
      if (col.key === "chuKy") {
        drawSignatureCell(
          page,
          fonts,
          { x, y: y - h, w: col.w, h },
          row.signature,
          row.signature?.signatureKey ? embedded.get(row.signature.signatureKey) : undefined
        );
      } else {
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
      }
      x += col.w;
    }
    y -= h;
    zebra = !zebra;
  }

  // Khối ký không đủ chỗ thì sang trang mới — nhưng trang đó chỉ có tiêu đề và khối ký,
  // KHÔNG vẽ lại đầu bảng: một đầu bảng 17 cột trống trơn phía trên chữ ký trông như bản
  // in bị lỗi giữa chừng.
  if (y < MARGIN + 130) {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = drawPageHeader(page, fonts, input);
  }
  drawSignatureBlock(page, fonts, y);

  await drawCoverPage(pdf, fonts);

  // Đánh số trang SAU KHI đã chèn bìa, và bỏ qua chính trang bìa: sổ in ra đóng thành
  // tập dày, thiếu số trang thì rơi mất một tờ cũng không ai biết.
  const pages = pdf.getPages();
  const total = pages.length - 1;
  for (let i = 1; i < pages.length; i++) {
    const label = `Trang ${i}/${total}`;
    const w = fonts.regular.widthOfTextAtSize(label, FS.small);
    pages[i].drawText(label, {
      x: PAGE.w - MARGIN - w,
      y: MARGIN - 16,
      size: FS.small,
      font: fonts.regular,
      color: BLACK,
    });
  }

  return Buffer.from(await pdf.save());
}
