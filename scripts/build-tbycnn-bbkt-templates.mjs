// Sinh 3 tệp mẫu BIÊN BẢN KIỂM TRA ĐỊNH KỲ dụng cụ ATLĐ:
//   templates/bbkt-thang-di-dong.docx
//   templates/bbkt-day-dai-an-toan.docx
//   templates/bbkt-dung-cu-dien-cam-tay.docx
//
// Chạy lại khi cần chỉnh cấu trúc mẫu: node scripts/build-tbycnn-bbkt-templates.mjs
// Token {{...}} do lib/tbycnn-bbkt-doc.ts điền bằng docxtemplater; bảng lặp theo {{#items}}.
//
// Bám đúng ba bản mẫu của phân xưởng (Thang di dong.pdf / Day deo an toan.pdf /
// Dung cu dien cam tay.pdf). HAI chỗ CỐ Ý sửa khác bản mẫu, vì đây là văn bản báo cáo:
//   • "KIỂM TRA ĐÌNH KỲ"  → "KIỂM TRA ĐỊNH KỲ"   (bản thang và dây đai gõ nhầm)
//   • "KT. TRƯỞNG PHONG KTAT" → "KT. TRƯỞNG PHÒNG KTAT" (cả ba bản gõ nhầm)
// Muốn giữ y nguyên lỗi của bản gốc thì sửa hai hằng dưới đây.
import PizZip from "pizzip";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FONT = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`;
const run = (text, { b = false, i = false, sz = 26, u = false, vert = null } = {}) =>
  `<w:r><w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}${u ? `<w:u w:val="single"/>` : ""}` +
  `${vert ? `<w:vertAlign w:val="${vert}"/>` : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>` +
  `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const p = (runsXml, { align = "left", before = 0, after = 60, ind = 0, hang = 0, firstLine = 0 } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>` +
  (ind || hang || firstLine
    ? `<w:ind w:left="${ind}"${hang ? ` w:hanging="${hang}"` : ""}${firstLine ? ` w:firstLine="${firstLine}"` : ""}/>`
    : "") +
  `<w:jc w:val="${align}"/></w:pPr>${runsXml}</w:p>`;

/** Đoạn văn thụt đầu dòng như văn bản hành chính (1cm ≈ 567 twip). */
const body = (text, opts = {}) => p(run(text), { firstLine: 567, align: "both", ...opts });
/** Mục đánh số in đậm: "1. Thành phần kiểm tra gồm có:" */
const heading = (text) => p(run(text, { b: true }), { ind: 567, after: 60 });
/** Gạch đầu dòng, không thụt lề đầu dòng. */
const bullet = (text) => p(run(text), { ind: 567, align: "both" });

const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

const BORDERS =
  `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>`;
const NO_BORDER = `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>`;

const table = (widths, rowsXml, { borders = true } = {}) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders ? BORDERS : ""}` +
  `<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rowsXml}</w:tbl>`;

const tc = (w, contentXml, { valign = "center", borders = null, span = 0, vMerge = null } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span ? `<w:gridSpan w:val="${span}"/>` : ""}` +
  `${vMerge ? `<w:vMerge${vMerge === "restart" ? ` w:val="restart"` : ""}/>` : ""}` +
  `${borders ?? ""}<w:vAlign w:val="${valign}"/></w:tcPr>${contentXml}</w:tc>`;
const tr = (cellsXml, { header = false } = {}) =>
  `<w:tr>${header ? `<w:trPr><w:tblHeader/></w:trPr>` : ""}${cellsXml}</w:tr>`;

/** Ô bảng chứa một dòng chữ, canh giữa theo mặc định của biểu mẫu. */
const cell = (w, text, { b = false, align = "center", sz = 24, ...rest } = {}) =>
  tc(w, p(run(text, { b, sz }), { align, after: 0 }), rest);

// ───────────────────────────── phần dùng chung của cả ba biên bản ─────────────────────────────

const TIEU_DE_PHONG_KTAT = "KT. TRƯỞNG PHÒNG KTAT"; // bản mẫu gõ "TRƯỞNG PHONG"

/** Khối quốc hiệu + số văn bản. Số để TRỐNG cho văn thư cấp khi phát hành, đúng bản mẫu. */
const quocHieu = table(
  [4500, 5000],
  tr(
    tc(
      4500,
      p(run("CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI"), { align: "center", after: 0 }) +
        p(run("PHÂN XƯỞNG VẬN HÀNH 1", { b: true }), { align: "center", after: 0 }) +
        p(run("Số:        /VH1"), { align: "center", before: 240, after: 0 }),
      { borders: NO_BORDER, valign: "top" }
    ) +
      tc(
        5000,
        p(run("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { b: true }), { align: "center", after: 0 }) +
          p(run("Độc lập – Tự do – Hạnh phúc", { b: true }), { align: "center", after: 0 }) +
          p(run("Vĩnh Long, {{ngayBanHanh}}", { i: true }), { align: "center", before: 240, after: 0 }),
        { borders: NO_BORDER, valign: "top" }
      )
  ),
  { borders: false }
);

/** Mục 1 — thành phần kiểm tra. Lặp theo {{#thanhPhan}} nên thêm/bớt người đều được. */
const thanhPhanBlock =
  heading("1. Thành phần kiểm tra gồm có:") +
  table(
    [4200, 5300],
    tr(
      tc(4200, p(run("{{#thanhPhan}}Ông: {{ten}}"), { after: 0 }), { borders: NO_BORDER, valign: "top" }) +
        tc(5300, p(run("Chức danh: {{chucDanh}}{{/thanhPhan}}"), { after: 0 }), { borders: NO_BORDER, valign: "top" })
    ),
    { borders: false }
  );

/** Khối ký cuối biên bản. Hai ô để TRỐNG cho ký tay — in sẵn chữ ký là chứng nhận khống. */
const kyBlock =
  table(
    [4750, 4750],
    tr(
      tc(
        4750,
        p(run(TIEU_DE_PHONG_KTAT, { b: true }), { align: "center", after: 0 }) +
          p(run("PHÓ PHÒNG KTAT", { b: true }), { align: "center", after: 0 }) +
          p(run(""), { after: 0 }) +
          p(run(""), { after: 0 }) +
          p(run(""), { after: 0 }) +
          p(run("Lương Thanh Phương", { b: true }), { align: "center", before: 240, after: 0 }),
        { borders: NO_BORDER, valign: "top" }
      ) +
        tc(
          4750,
          p(run("KT. QUẢN ĐỐC PXVH1", { b: true }), { align: "center", after: 0 }) +
            p(run("PHÓ QUẢN ĐỐC", { b: true }), { align: "center", after: 0 }) +
            p(run(""), { after: 0 }) +
            p(run(""), { after: 0 }) +
            p(run(""), { after: 0 }) +
            p(run("Nguyễn Văn Cường", { b: true }), { align: "center", before: 240, after: 0 }),
          { borders: NO_BORDER, valign: "top" }
        )
    ),
    { borders: false }
  ) +
  p(run("Nơi nhận:", { b: true, i: true, sz: 22 }), { after: 0 }) +
  p(run("- KTAT, VH1;", { sz: 22 }), { after: 0 }) +
  p(run("- Lưu: VH1, KTAT.", { sz: 22 }), { after: 0 });

/** Bảng khung ảnh để trống — người lập dán ảnh hiện trường vào Word sau khi xuất. */
const khungAnh = (rows, cols) => {
  const w = Math.floor(9500 / cols);
  const emptyRow = tr(
    Array.from({ length: cols })
      .map(() => tc(w, p(run(""), { after: 0 }) + p(run(""), { after: 0 }) + p(run(""), { after: 0 }) + p(run(""), { after: 0 })))
      .join("")
  );
  return table(Array.from({ length: cols }, () => w), Array.from({ length: rows }).map(() => emptyRow).join(""));
};

const CAN_CU_EVN = [
  "Căn cứ Quyết định 278/QĐ-EVN ngày 25/02/2026 Về việc ban hành Quy trình an toàn trong Tập đoàn Điện lực Quốc gia Việt Nam;",
  "Căn cứ Quyết định 167/QĐ-EVNGENCO1 ngày 21/4/2026 Về việc ban hành Quy trình an toàn trong Tổng công ty Phát điện 1;",
];

const GHI_CHU_THU_TAI = "Khi thử nghiệm tĩnh, vật nặng để thử phải cách mặt đất hoặc mặt sàn khoảng 100 mm.";

/** Đầu biên bản dùng chung: quốc hiệu → tiêu đề → căn cứ → thành phần → thời gian, địa điểm. */
const moDau = (tieuDe, canCu, nhanThoiGian = "2. Thời gian, địa điểm:") =>
  [
    quocHieu,
    p(run("BIÊN BẢN", { b: true, sz: 28 }), { align: "center", before: 240, after: 0 }),
    p(run(tieuDe, { b: true, sz: 28 }), { align: "center", after: 180 }),
    ...canCu.map((text) => body(text)),
    thanhPhanBlock,
    heading(nhanThoiGian),
    bullet("Thời gian: {{thoiGian}}"),
    bullet("Địa điểm: {{diaDiem}}"),
  ].join("");

// ───────────────────────────── biểu mẫu 1: THANG DI ĐỘNG ─────────────────────────────

const thangCols = [560, 1500, 1900, 1600, 800, 850, 1500, 700, 700, 1200];
const thangHead = [
  "TT", "Tên dụng cụ", "Mã hiệu", "Thông số kỹ thuật", "Tải trọng thử (kg)",
  "Thời gian thử (phút)", "Cương vị quản lý", "Kết quả", "Chu kỳ (tháng)", "Thời gian kiểm tra tiếp theo",
];
const thangTable = table(
  thangCols,
  tr(thangHead.map((label, i) => cell(thangCols[i], label, { b: true })).join(""), { header: true }) +
    tr(
      cell(thangCols[0], "I", { b: true }) +
        tc(thangCols.slice(1).reduce((a, b) => a + b, 0), p(run("Thang di động", { b: true, sz: 24 }), { after: 0 }), {
          span: thangCols.length - 1,
        })
    ) +
    tr(
      cell(thangCols[0], "{{#items}}{{tt}}") +
        cell(thangCols[1], "{{tenThietBi}}") +
        cell(thangCols[2], "{{maHieu}}") +
        cell(thangCols[3], "{{thongSoKyThuat}}") +
        cell(thangCols[4], "{{taiTrongThuKg}}") +
        cell(thangCols[5], "{{thoiGianThuPhut}}") +
        cell(thangCols[6], "{{cuongVi}}") +
        cell(thangCols[7], "{{ketQuaThu}}") +
        cell(thangCols[8], "{{chuKyThu}}") +
        cell(thangCols[9], "{{kdTiepTheo}}{{/items}}")
    )
);

const thangBody = [
  moDau("KIỂM TRA ĐỊNH KỲ THANG DI ĐỘNG", CAN_CU_EVN),
  heading("3. Nội dung kiểm tra:"),
  bullet("Kiểm tra định kỳ các loại thang di động hiện có của PXVH1:"),
  bullet("- Số lượng kiểm tra gồm: {{tongSo}} thang di động."),
  bullet("Phương pháp kiểm tra:"),
  bullet("- Kiểm tra bằng mắt về: bậc thang, đinh, chốt..."),
  bullet("- Thử tải tĩnh thang di động theo QĐ số 278 và 167."),
  heading("4. Kết quả đánh giá:"),
  bullet("- Đã kiểm tra {{soDat}} thang di động đạt yêu cầu kỹ thuật an toàn, được phép sử dụng."),
  p(run("(Chi tiết như phụ lục đính kèm)", { i: true }), { ind: 567 }),
  heading("5. Kiến nghị"),
  bullet("- Đồng ý đưa vào sử dụng các loại thang di động đạt yêu cầu an toàn cho phép sử dụng."),
  bullet(
    "- Phân xưởng Vận hành 1 quản lý sử dụng các thang di động như trên phải kiểm tra lại tổng quan trước khi sử dụng và thực hiện đúng quy định sử dụng thang di động."
  ),
  body("Trân trọng./."),
  kyBlock,
  PAGE_BREAK,
  p(run("PHỤ LỤC", { b: true }), { align: "center", after: 0 }),
  p(run("Danh mục các loại dụng cụ kiểm tra định kỳ", { b: true }), { align: "center", after: 120 }),
  thangTable,
  p(run("Ghi chú:", { b: true }), { before: 120, after: 0 }),
  p(run(GHI_CHU_THU_TAI, { i: true })),
].join("");

// ───────────────────────────── biểu mẫu 2: DÂY ĐEO AN TOÀN ─────────────────────────────

const dayCols = [560, 1900, 1900, 1200, 900, 1300, 1600, 700, 1250];
const dayHead = [
  "TT", "Tên các loại máy móc, dụng cụ cẩu kéo", "Mã hiệu", "Cương vị sử dụng",
  "Tải trọng thử (kg)", "Tình trạng", "Kết quả", "Chu kỳ (tháng)", "Thời gian kiểm tra tiếp theo",
];
const dayTable = table(
  dayCols,
  tr(dayHead.map((label, i) => cell(dayCols[i], label, { b: true })).join(""), { header: true }) +
    tr(
      cell(dayCols[0], "I", { b: true }) +
        tc(dayCols.slice(1).reduce((a, b) => a + b, 0), p(run("Dây đai an toàn", { b: true, sz: 24 }), { after: 0 }), {
          span: dayCols.length - 1,
        })
    ) +
    tr(
      cell(dayCols[0], "{{#items}}{{tt}}") +
        cell(dayCols[1], "{{tenThietBi}}") +
        cell(dayCols[2], "{{maHieu}}") +
        cell(dayCols[3], "{{cuongVi}}") +
        cell(dayCols[4], "{{taiTrongThuKg}}") +
        cell(dayCols[5], "{{tinhTrangSuDung}}") +
        cell(dayCols[6], "{{ketQuaThu}}") +
        cell(dayCols[7], "{{chuKyThu}}") +
        cell(dayCols[8], "{{kdTiepTheo}}{{/items}}")
    )
);

const dayBody = [
  moDau("KIỂM TRA ĐỊNH KỲ DÂY ĐEO AN TOÀN", CAN_CU_EVN),
  heading("3. Nội dung kiểm tra:"),
  bullet("Kiểm tra định kỳ các loại máy móc, dụng cụ cẩu kéo hiện có của PXVH1:"),
  bullet("- Số lượng kiểm tra gồm: {{tongSo}} dây đeo an toàn."),
  bullet("Phương pháp kiểm tra:"),
  bullet("- Kiểm tra bằng mắt về: móc treo, khóa, đai, dây treo."),
  bullet("- Thử tải tĩnh, động các loại máy móc, dụng cụ cẩu kéo."),
  heading("4. Kết quả đánh giá:"),
  bullet("- Đã kiểm tra {{soDat}}/{{tongSo}} dây đeo an toàn đạt yêu cầu kỹ thuật an toàn, được phép sử dụng."),
  p(run("(Chi tiết như phụ lục đính kèm)", { i: true }), { ind: 567 }),
  heading("5. Kiến nghị"),
  bullet("- Đồng ý đưa vào sử dụng dây an toàn đạt yêu cầu an toàn cho phép sử dụng."),
  bullet(
    "- Phân xưởng Vận hành 1 quản lý sử dụng các dây an toàn dưới phải kiểm tra lại tổng quan trước khi sử dụng và thực hiện đúng quy định sử dụng dây đai an toàn."
  ),
  body("Trân trọng./."),
  kyBlock,
  PAGE_BREAK,
  p(run("PHỤ LỤC", { b: true }), { align: "center", after: 0 }),
  p(run("Danh mục các loại máy móc, dụng cụ cẩu kéo kiểm tra định kỳ", { b: true }), { align: "center", after: 120 }),
  dayTable,
  p(run("Ghi chú:", { b: true }), { before: 120, after: 0 }),
  p(run("PH - Tải trọng làm việc cho phép.", { i: true }), { after: 0 }),
  p(run(GHI_CHU_THU_TAI, { i: true })),
  PAGE_BREAK,
  p(run("HÌNH ẢNH ĐÍNH KÈM", { b: true }), { align: "center", after: 120 }),
  khungAnh(2, 3),
].join("");

// ───────────────────────────── biểu mẫu 3: DỤNG CỤ ĐIỆN CẦM TAY ─────────────────────────────

const dcCols = [520, 1300, 1400, 2100, 800, 800, 700, 900, 700, 1100, 700];
/** Đầu bảng HAI TẦNG: 4 cột giữa gộp dưới nhãn "Kết quả kiểm tra", đúng bản mẫu. */
const dcHeadRow1 =
  cell(dcCols[0], "TT", { b: true, vMerge: "restart" }) +
  cell(dcCols[1], "Tên dụng cụ điện cầm tay", { b: true, vMerge: "restart" }) +
  cell(dcCols[2], "Mã hiệu", { b: true, vMerge: "restart" }) +
  cell(dcCols[3], "Thông số kỹ thuật", { b: true, vMerge: "restart" }) +
  tc(
    dcCols[4] + dcCols[5] + dcCols[6] + dcCols[7],
    p(run("Kết quả kiểm tra", { b: true, sz: 24 }), { align: "center", after: 0 }),
    { span: 4 }
  ) +
  cell(dcCols[8], "Chu kỳ (tháng)", { b: true, vMerge: "restart" }) +
  cell(dcCols[9], "Ngày kiểm tra tiếp theo", { b: true, vMerge: "restart" }) +
  cell(dcCols[10], "Ghi chú", { b: true, vMerge: "restart" });
const dcHeadRow2 =
  tc(dcCols[0], p(run(""), { after: 0 }), { vMerge: "cont" }) +
  tc(dcCols[1], p(run(""), { after: 0 }), { vMerge: "cont" }) +
  tc(dcCols[2], p(run(""), { after: 0 }), { vMerge: "cont" }) +
  tc(dcCols[3], p(run(""), { after: 0 }), { vMerge: "cont" }) +
  cell(dcCols[4], "Kiểm tra bằng mắt", { b: true }) +
  cell(dcCols[5], "Trị số đo cách điện (MΩ)", { b: true }) +
  cell(dcCols[6], "Đánh giá", { b: true }) +
  cell(dcCols[7], "Nghiệm thu sau khi sửa chữa", { b: true }) +
  tc(dcCols[8], p(run(""), { after: 0 }), { vMerge: "cont" }) +
  tc(dcCols[9], p(run(""), { after: 0 }), { vMerge: "cont" }) +
  tc(dcCols[10], p(run(""), { after: 0 }), { vMerge: "cont" });

const dcTable = table(
  dcCols,
  tr(dcHeadRow1, { header: true }) +
    tr(dcHeadRow2, { header: true }) +
    tr(
      cell(dcCols[0], "{{#items}}{{tt}}") +
        cell(dcCols[1], "{{tenThietBi}}") +
        cell(dcCols[2], "{{maHieu}}") +
        tc(dcCols[3], p(run("{{thongSoKyThuat}}", { sz: 24 }), { after: 0 })) +
        cell(dcCols[4], "{{kiemTraBangMat}}") +
        cell(dcCols[5], "{{cachDienMOhm}}") +
        cell(dcCols[6], "{{ketQuaThu}}") +
        cell(dcCols[7], "{{nghiemThuSauSuaChua}}") +
        cell(dcCols[8], "{{chuKyThu}}") +
        cell(dcCols[9], "{{kdTiepTheo}}") +
        cell(dcCols[10], "{{ghiChu}}{{/items}}")
    )
);

const dcBody = [
  moDau("KIỂM TRA ĐỊNH KỲ DỤNG CỤ ĐIỆN CẦM TAY", [
    "Căn cứ Thông tư số 34/2012/TT-BLĐTBXH về việc ban hành Quy chuẩn kỹ thuật quốc gia về an toàn lao động đối với dụng cụ điện cầm tay truyền động bằng động cơ;",
    ...CAN_CU_EVN,
    "Căn cứ Quyết định số 1268/QĐ-NĐDH ngày 06/8/2021 về việc ban hành Quy định an toàn sử dụng các dụng cụ điện cầm tay truyền động bằng động cơ trong Công ty Nhiệt điện Duyên Hải.",
  ], "2. Thời gian, địa điểm kiểm tra"),
  heading("3. Nội dung kiểm tra"),
  bullet("- Kiểm tra định kỳ dụng cụ cầm tay hiện có của Phân xưởng Vận hành 1"),
  bullet("- Số lượng kiểm tra: {{tongSo}} cái."),
  bullet("- Phương pháp kiểm tra:"),
  bullet("+ Kiểm tra bằng mắt: Kiểm tra dây, jack cắm, vỏ tay cầm và công tắc."),
  bullet("+ Đo cách điện bằng máy: FLUKE 1550C."),
  heading("4. Kết quả, đánh giá"),
  bullet("- Kết quả: Đã kiểm tra {{tongSo}} dụng cụ cầm tay, kết quả như sau: đạt yêu cầu kỹ thuật an toàn, được phép sử dụng"),
  bullet("+ Mã quản lý cho từng dụng cụ, cụ thể như bảng phụ lục đính kèm:"),
  heading("5. Đánh giá, kiến nghị"),
  bullet("- {{soDat}} dụng cụ đạt yêu cầu kỹ thuật an toàn, được phép sử dụng."),
  bullet(
    "- Phân xưởng Vận hành 1 quản lý sử dụng các dụng cụ như trên phải sửa chữa đo cách điện đạt, kiểm tra lại tổng quan trước khi sử dụng và thực hiện đúng quy định sử dụng dụng cụ an toàn."
  ),
  body("Trân trọng./."),
  kyBlock,
  PAGE_BREAK,
  p(run("PHỤ LỤC", { b: true }), { align: "center", after: 0 }),
  p(run("DANH SÁCH DỤNG CỤ ĐIỆN CẦM TAY", { b: true }), { align: "center", after: 120 }),
  dcTable,
  p(run("HÌNH ẢNH ĐÍNH KÈM", { b: true }), { align: "center", before: 240, after: 120 }),
  khungAnh(2, 2),
].join("");

// ───────────────────────────── đóng gói ─────────────────────────────

/**
 * Phụ lục là bảng NGANG (10-11 cột) còn phần chữ là dọc, nên mỗi tệp có HAI section:
 * phần chữ khổ dọc, phụ lục khổ ngang. Nhét cả hai vào một section khổ dọc thì bảng
 * phụ lục bị bóp lại không đọc nổi.
 */
const PORTRAIT = `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709"/>`;
const LANDSCAPE = `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709"/>`;

function buildDocx(fileName, portraitXml, landscapeXml) {
  // Section đầu (khổ dọc) khai báo bằng một <w:p> mang sectPr ở CUỐI phần chữ; section
  // cuối (khổ ngang) khai báo ở cuối <w:body>. Đây là cách OOXML đổi hướng giấy giữa chừng.
  const portraitSect = `<w:p><w:pPr><w:sectPr>${PORTRAIT}</w:sectPr></w:pPr></w:p>`;
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${portraitXml}${portraitSect}${landscapeXml}<w:sectPr>${LANDSCAPE}</w:sectPr></w:body></w:document>`;

  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.folder("word").file("document.xml", documentXml);
  zip.folder("word/_rels").file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );

  const out = path.join(process.cwd(), "templates", fileName);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("Đã tạo", out);
}

/** Cắt phần chữ (khổ dọc) khỏi phụ lục (khổ ngang) tại dấu ngắt trang đầu tiên. */
function split(bodyXml) {
  const at = bodyXml.indexOf(PAGE_BREAK);
  if (at < 0) throw new Error("Thiếu dấu ngắt trang giữa phần chữ và phụ lục");
  return [bodyXml.slice(0, at), bodyXml.slice(at + PAGE_BREAK.length)];
}

for (const [file, bodyXml] of [
  ["bbkt-thang-di-dong.docx", thangBody],
  ["bbkt-day-dai-an-toan.docx", dayBody],
  ["bbkt-dung-cu-dien-cam-tay.docx", dcBody],
]) {
  const [portrait, landscape] = split(bodyXml);
  buildDocx(file, portrait, landscape);
}
