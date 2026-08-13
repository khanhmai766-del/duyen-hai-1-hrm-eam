/**
 * Dựng PDF bảng FOAM · CO2 · DIESEL · FM200 — in ĐÚNG HÌNH cái bảng trên web, không
 * theo Mẫu số 01: bảng bồn ở trên, rồi mỗi bảng FM200 một khối riêng có đầu bảng là các
 * bình (1A…8B) và hai dòng chỉ số.
 *
 * Bảng FM200 có tới 16 bình nên cột hẹp; khi số bình vượt sức chứa một trang ngang thì
 * CẮT LÀM NHIỀU KHỐI theo bình (mỗi khối vẫn có đủ cột Loại đo/Min/Max/ĐVT), thay vì bóp
 * cột đến mức không đọc nổi con số.
 *
 * Phông chữ, kẻ ô, chữ ký dùng chung ở lib/pccc-pdf-kit.ts — đọc phần đầu file đó trước.
 */
import { PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
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
import type { FcdPanel, FcdReport } from "@/lib/pccc-fcd-report";

/** Bảng bồn: STT · Tên · Cương vị · ĐVT · KL thiết kế · KL hiện tại · % còn lại · Tình trạng · Ngày chốt · Người chốt · Ghi chú · Chữ ký. */
// Cộng lại phải ĐÚNG BẰNG CONTENT_W (762): dư ra là cột cuối (chữ ký) tràn khỏi lề
// phải và bị xén mất khi in.
const BULK_COLS = [24, 126, 70, 32, 52, 52, 40, 72, 58, 64, 94, 78] as const;
const BULK_HEADERS = [
  "STT",
  "Tên",
  "Cương vị quản lý",
  "ĐVT",
  "KL thiết kế",
  "KL hiện tại",
  "% còn lại",
  "Tình trạng",
  "Ngày chốt",
  "Người chốt",
  "Ghi chú",
  "Chữ ký",
] as const;
const BULK_ROW_H = 44;

/** Bốn cột đầu của bảng FM200, phần còn lại chia đều cho các bình. */
const FM_HEAD_COLS = [80, 38, 38, 52] as const;
const FM_ROW_H = 22;
/** Cột bình hẹp hơn mức này thì con số không đọc nổi → cắt bảng làm nhiều khối. */
// 16 bình của bảng ĐKTT phải nằm gọn MỘT khối: cắt lẻ ra khối thứ hai chỉ chứa 1 bình
// thì bảng in ra vừa xấu vừa khó dò. Số đo dài nhất là "2000" — 28pt là đủ đọc.
const FM_MIN_BINH_W = 28;

export type FcdPdfInput = {
  periodLabel: string;
  report: FcdReport;
  /** Ảnh chữ ký theo S3 key (đã tải sẵn ở lớp gọi). */
  signatureImages: Map<string, Buffer>;
};

function fmtNum(value: number | null) {
  if (value === null || value === undefined) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/**
 * Vẽ ảnh chữ ký + họ tên trong một ô. Không có ảnh thì chỉ còn tên — mất cả hai là ô
 * trống, không ai biết ai đã ký.
 *
 * `withName: false` dùng cho ô ký của hai bảng FM200: họ tên người kiểm tra đã nằm ngay
 * ô bên trái cùng dòng, in thêm dưới chữ ký là lặp lại lần thứ hai và ăn mất chỗ của nét
 * ký. Bảng bồn thì vẫn cần tên vì mỗi dòng một người ký khác nhau.
 */
function drawSignature(
  page: PDFPage,
  opts: { x: number; y: number; w: number; h: number; fonts: PdfFonts; name: string; image?: PDFImage; withName?: boolean }
) {
  const { x, y, w, h, fonts, name, image } = opts;
  const withName = opts.withName ?? true;
  if (!image) {
    drawCell(page, name, { x, y, w, h, font: fonts.regular, size: FS.small, align: "center", maxLines: 2 });
    return;
  }
  const nameH = withName ? 16 : 0;
  const pad = 4;
  const scale = Math.min((w - pad * 2) / image.width, (h - nameH - pad) / image.height);
  const imgH = image.height * scale;
  page.drawImage(image, {
    x: x + (w - image.width * scale) / 2,
    // Không có tên thì chữ ký nằm giữa ô; có tên thì đẩy sát mép trên, chừa chỗ cho tên.
    y: withName ? y + h - 2 - imgH : y + (h - imgH) / 2,
    width: image.width * scale,
    height: imgH,
  });
  if (withName) {
    drawCell(page, name, { x, y: y + 1, w, h: nameH, font: fonts.regular, size: 7, align: "center", maxLines: 2 });
  }
}

export async function buildPcccFcdPdf(input: FcdPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await loadPdfFonts(pdf);
  pdf.setTitle(`Foam - CO2 - Diesel - FM200 - ${input.periodLabel}`);

  const embedded = new Map<string, PDFImage>();
  for (const [key, buffer] of input.signatureImages) {
    const flat = await signatureInk(buffer);
    try {
      embedded.set(key, await pdf.embedPng(flat));
    } catch {
      try {
        embedded.set(key, await pdf.embedJpg(flat));
      } catch {
        // Ảnh hỏng thì bỏ qua — ô chữ ký vẫn còn họ tên.
      }
    }
  }
  const imageOf = (key: string | null) => (key ? embedded.get(key) : undefined);

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN;

  /** Xin chỗ trên trang; không đủ thì sang trang mới. */
  function ensure(height: number) {
    if (y - height < MARGIN) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
    }
  }

  drawCentered(page, "BẢNG THEO DÕI FOAM · CO2 · DIESEL · FM200", fonts.bold, FS.title, y - 10);
  y -= 26;
  drawCentered(page, `Kỳ kiểm tra ${input.periodLabel} — Phân xưởng Vận hành 1`, fonts.regular, FS.sub, y);
  y -= 26;

  // ---- Bảng bồn Foam / CO2 / Diesel
  const headH = 30;
  let x = MARGIN;
  BULK_COLS.forEach((w, i) => {
    rect(page, x, y - headH, w, headH);
    drawCell(page, BULK_HEADERS[i], { x, y: y - headH, w, h: headH, font: fonts.bold, size: FS.small, align: "center" });
    x += w;
  });
  y -= headH;

  for (const b of input.report.bulks) {
    ensure(BULK_ROW_H);
    const top = y - BULK_ROW_H;
    const cells: Record<number, string> = {
      0: b.stt === null ? "" : String(b.stt),
      1: b.ten,
      2: b.cuongVi,
      3: b.dvt,
      4: fmtNum(b.khoiLuongThietKe),
      5: fmtNum(b.khoiLuongHienTai),
      6: b.phanTramConLai === null ? "" : `${Math.round(b.phanTramConLai * 100)}%`,
      7: b.tinhTrang,
      8: fmtDate(b.ngayChot),
      9: b.nguoiChot,
      10: b.ghiChu,
    };
    x = MARGIN;
    BULK_COLS.forEach((w, i) => {
      rect(page, x, top, w, BULK_ROW_H);
      if (i in cells) {
        drawCell(page, cells[i], {
          x,
          y: top,
          w,
          h: BULK_ROW_H,
          font: fonts.regular,
          // Ngày chốt / người chốt / ghi chú là chuỗi dài trong ô hẹp — chữ nhỏ hơn để
          // "08/08/2026" không bị bẻ làm đôi dòng.
          size: i >= 8 ? FS.small : FS.body,
          align: i === 1 || i === 10 ? "left" : "center",
          maxLines: 3,
        });
      }
      x += w;
    });
    drawSignature(page, {
      x: MARGIN + BULK_COLS.slice(0, 11).reduce((a, c) => a + c, 0),
      y: top,
      w: BULK_COLS[11],
      h: BULK_ROW_H,
      fonts,
      name: b.signerName,
      image: imageOf(b.signatureKey),
    });
    y = top;
  }

  // ---- Từng bảng FM200
  for (const panel of input.report.panels) {
    // Ô này cao hơn một dòng chữ thường vì nửa phải của nó là CHỮ KÝ: 26pt thì nét ký
    // co lại chỉ còn bằng cỡ chữ, nhìn không ra chữ ký.
    const infoH = 40;
    const signW = 130;

    y -= 22;
    // Xin chỗ cho CẢ CỤM tiêu đề + dòng ký + đầu bảng + hai dòng số liệu, không phải cho
    // riêng dòng sắp vẽ. Xin từng dòng một thì tiêu đề và chữ ký ở lại cuối trang này còn
    // số liệu rơi sang trang sau, nhìn tờ giấy đó không biết bảng của hệ thống nào.
    ensure(24 + infoH + FM_ROW_H * 3);
    drawCentered(page, panel.title.toUpperCase(), fonts.bold, FS.sub, y - 10);
    y -= 24;

    // Dòng thông tin ký của cả bảng — đặt NGAY DƯỚI tiêu đề như trên web.
    const infoW = CONTENT_W - signW;
    rect(page, MARGIN, y - infoH, infoW, infoH);
    drawCell(
      page,
      // Ngăn cách bằng dấu chấm giữa, KHÔNG bằng nhiều dấu cách: `wrap` gộp mọi khoảng
      // trắng liên tiếp thành một nên ba mục sẽ dính vào nhau thành một câu khó đọc.
      `Ngày kiểm tra: ${fmtDate(panel.ngayKiemTra) || "—"} · Người kiểm tra: ${panel.nguoiKiemTra || "—"} · ${panel.binhLabels.length} bình`,
      { x: MARGIN, y: y - infoH, w: infoW, h: infoH, font: fonts.regular, size: FS.body, align: "left", maxLines: 2 }
    );
    rect(page, MARGIN + infoW, y - infoH, signW, infoH);
    drawSignature(page, {
      x: MARGIN + infoW,
      y: y - infoH,
      w: signW,
      h: infoH,
      fonts,
      name: panel.signerName,
      image: imageOf(panel.signatureKey),
      withName: false,
    });
    y -= infoH;

    for (const chunk of splitBinh(panel)) {
      const binhW = (CONTENT_W - FM_HEAD_COLS.reduce((a, c) => a + c, 0)) / chunk.length;
      ensure(FM_ROW_H * 3 + 6);
      // Đầu bảng: Loại đo · Min · Max · ĐVT · <tên từng bình>
      x = MARGIN;
      ["Loại đo", "Min", "Max", "ĐVT"].forEach((label, i) => {
        rect(page, x, y - FM_ROW_H, FM_HEAD_COLS[i], FM_ROW_H);
        drawCell(page, label, {
          x,
          y: y - FM_ROW_H,
          w: FM_HEAD_COLS[i],
          h: FM_ROW_H,
          font: fonts.bold,
          size: FS.small,
          align: "center",
        });
        x += FM_HEAD_COLS[i];
      });
      for (const label of chunk) {
        rect(page, x, y - FM_ROW_H, binhW, FM_ROW_H);
        drawCell(page, label, { x, y: y - FM_ROW_H, w: binhW, h: FM_ROW_H, font: fonts.bold, size: FS.small, align: "center", maxLines: 1 });
        x += binhW;
      }
      y -= FM_ROW_H;

      for (const row of panel.rows) {
        const top = y - FM_ROW_H;
        x = MARGIN;
        [row.label, fmtNum(row.min), fmtNum(row.max), row.dvt].forEach((text, i) => {
          rect(page, x, top, FM_HEAD_COLS[i], FM_ROW_H);
          drawCell(page, text, {
            x,
            y: top,
            w: FM_HEAD_COLS[i],
            h: FM_ROW_H,
            font: i === 0 ? fonts.bold : fonts.regular,
            size: FS.small,
            align: i === 0 ? "left" : "center",
            maxLines: 1,
          });
          x += FM_HEAD_COLS[i];
        });
        for (const label of chunk) {
          const index = panel.binhLabels.indexOf(label);
          rect(page, x, top, binhW, FM_ROW_H);
          drawCell(page, fmtNum(row.values[index] ?? null), {
            x,
            y: top,
            w: binhW,
            h: FM_ROW_H,
            font: fonts.regular,
            size: FS.small,
            align: "center",
            maxLines: 1,
          });
          x += binhW;
        }
        y = top;
      }
      y -= 6;
    }
  }

  return Buffer.from(await pdf.save());
}

/**
 * Chia danh sách bình thành nhiều khối để cột không hẹp quá mức đọc được. 16 bình trên
 * khổ A4 ngang vẫn vừa; ngưỡng này là lưới an toàn cho bảng nhiều bình hơn về sau.
 */
function splitBinh(panel: FcdPanel): string[][] {
  const available = CONTENT_W - FM_HEAD_COLS.reduce((a, c) => a + c, 0);
  const maxPerChunk = Math.max(1, Math.floor(available / FM_MIN_BINH_W));
  if (panel.binhLabels.length <= maxPerChunk) return [panel.binhLabels];
  const chunks: string[][] = [];
  for (let i = 0; i < panel.binhLabels.length; i += maxPerChunk) {
    chunks.push(panel.binhLabels.slice(i, i + maxPerChunk));
  }
  return chunks;
}
