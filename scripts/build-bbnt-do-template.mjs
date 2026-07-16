// Sinh templates/bbnt-do-template.docx — mẫu "BIÊN BẢN NGHIỆM THU LẮP ĐẶT, CHẠY THỬ
// VÀ HOÀN THÀNH ĐƯA VÀO SỬ DỤNG" (BBNT DO) theo mẫu PDF của phân xưởng.
// Chạy lại khi cần chỉnh cấu trúc mẫu: node scripts/build-bbnt-do-template.mjs
// Các token {{...}} do lib/bbnt-do-doc.ts điền bằng docxtemplater; {{%...}} là ảnh chữ ký.
import PizZip from "pizzip";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FONT = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`;
const run = (text, { b = false, i = false, sz = 26, u = false } = {}) =>
  `<w:r><w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}${u ? `<w:u w:val="single"/>` : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const tabR = () => `<w:r><w:tab/></w:r>`;

const p = (runsXml, { align = "left", before = 0, after = 60, ind = 0, hang = 0 } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>` +
  (ind || hang ? `<w:ind w:left="${ind}"${hang ? ` w:hanging="${hang}"` : ""}/>` : "") +
  `<w:jc w:val="${align}"/></w:pPr>${runsXml}</w:p>`;

const BORDERS =
  `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>`;

const table = (widths, rowsXml, { borders = true } = {}) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders ? BORDERS : ""}<w:tblLayout w:type="fixed"/></w:tblPr>` +
  `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rowsXml}</w:tbl>`;

const tc = (w, contentXml, { valign = "center" } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="${valign}"/></w:tcPr>${contentXml}</w:tc>`;
const tr = (cellsXml) => `<w:tr>${cellsXml}</w:tr>`;

// ================= Trang 1-3 (dọc) =================
const header = table(
  [4700, 5000],
  tr(
    tc(4700, p(run("CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI", { b: true, sz: 24 }), { align: "center", after: 0 }) + p(run("PHÂN XƯỞNG VẬN HÀNH 1", { b: true, sz: 24, u: true }), { align: "center", after: 0 })) +
    tc(5000, p(run("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { b: true, sz: 24 }), { align: "center", after: 0 }) + p(run("Độc Lập – Tự Do – Hạnh Phúc", { b: true, sz: 24, u: true }), { align: "center", after: 0 }))
  ),
  { borders: false }
);

const soLine = table(
  [4700, 5000],
  tr(
    tc(4700, p(run("Số: ") + run("……………"), { after: 0 })) +
    tc(5000, p(run("Vĩnh Long, ngày …… tháng …… năm ……", { i: true }), { align: "center", after: 0 }))
  ),
  { borders: false }
);

const body1 = [
  header,
  soLine,
  p(run(""), { after: 60 }),
  p(run("BIÊN BẢN", { b: true, sz: 28 }), { align: "center", after: 0 }),
  p(run("NGHIỆM THU LẮP ĐẶT, CHẠY THỬ VÀ HOÀN THÀNH ĐƯA VÀO SỬ DỤNG", { b: true, sz: 26 }), { align: "center", after: 120 }),

  p(run("1.", { b: true }) + tabR() + run("Đối tượng nghiệm thu:", { b: true })),
  p(run("-") + tabR() + run("Hệ thống, thiết bị: {{unit}} - {{deviceSeq}}"), { ind: 567 }),
  p(run("-") + tabR() + run("Vị trí lắp đặt: {{deviceNameManual}}"), { ind: 567 }),
  p(run("-") + tabR() + run("PCT/LCT số: {{pctNumber}}"), { ind: 567 }),

  p(run("2.", { b: true }) + tabR() + run("Thành phần tham gia nghiệm thu:", { b: true })),
  p(run("2.1.", { b: true, i: true }) + tabR() + run("Đại diện phòng Kỹ thuật và an toàn", { b: true, i: true }), { ind: 567 }),
  p(run("Ông: ……………………………") + tabR() + run("Chức vụ: ……………………"), { ind: 900 }),
  p(run("2.2.", { b: true, i: true }) + tabR() + run("Đại diện đơn vị sửa chữa: Phân xưởng Sửa chữa cơ nhiệt:", { b: true, i: true }), { ind: 567 }),
  p(run("Ông: ……………………………") + tabR() + run("Chức vụ: ……………………"), { ind: 900 }),
  p(run("2.3.", { b: true, i: true }) + tabR() + run("Đại diện đơn vị chủ quản thiết bị: Phân xưởng Vận hành 1:", { b: true, i: true }), { ind: 567 }),
  p(run("Ông: {{quanDocName}}") + tabR() + run("Chức vụ: Quản đốc"), { ind: 900 }),
  p(run("Ông: {{usedByName}}") + tabR() + run("Chức vụ: {{usedByPosition}}"), { ind: 900 }),

  p(run("3.", { b: true }) + tabR() + run("Thời gian và địa điểm nghiệm thu:", { b: true })),
  p(run("-") + tabR() + run("Bắt đầu:") + tabR() + run("{{workStartedAt}}"), { ind: 567 }),
  p(run("-") + tabR() + run("Kết thúc:") + tabR() + run("{{workEndedAt}}"), { ind: 567 }),
  p(run("4.", { b: true }) + tabR() + run("Tại:", { b: true }) + run(" {{deviceNameManual}}")),

  p(run("5.", { b: true }) + tabR() + run("Nội dung nghiệm thu lắp đặt và chạy thử:", { b: true })),
  p(run("5.1.", { b: true, i: true }) + tabR() + run("Tài liệu căn cứ nghiệm thu:", { b: true, i: true }), { ind: 567 }),
  p(run("-") + tabR() + run("Kết quả kiểm tra:"), { ind: 900 }),
  p(run("-") + tabR() + run("Phương án chi tiết sửa chữa, bảo dưỡng hệ thống, thiết bị ") + run("(không);", { i: true }), { ind: 900 }),
  p(run("-") + tabR() + run("{{proposalNumber}}. {{proposalReceiverName}}"), { ind: 900 }),
  p(run("-") + tabR() + run("Vật tư công ty cấp;"), { ind: 900 }),
  p(run("-") + tabR() + run("Biên bản nghiệm thu vật tư, thiết bị trước khi đưa vào sử dụng ngày ") + run("(nếu có);", { i: true }), { ind: 900 }),
  p(run("-") + tabR() + run("Các tài liệu kỹ thuật, hồ sơ vật tư, thiết bị liên quan ") + run("(không)", { i: true }), { ind: 900 }),
  p(run("5.2.", { b: true, i: true }) + tabR() + run("Đánh giá chất lượng lắp đặt và chạy thử:", { b: true, i: true }), { ind: 567 }),
  p(run("-") + tabR() + run("Tiến độ lắp đặt:") + tabR() + run("Bắt đầu {{workStartedDate}} kết thúc {{workEndedDate}}"), { ind: 900 }),
  p(run("-") + tabR() + run("Thời gian chạy thử:") + tabR() + run("Bắt đầu {{workStartedDate}} kết thúc {{workEndedDate}}"), { ind: 900 }),
  p(run("-") + tabR() + run("Đánh giá tiến độ:") + tabR() + run("Đạt yêu cầu."), { ind: 900 }),
  p(run("-") + tabR() + run("Chất lượng lắp đặt thiết bị đảm bảo yêu cầu kỹ thuật, phương án kỹ thuật;"), { ind: 900 }),
].join("");

// Bảng nội dung công tác (trang 2)
const workCols = [700, 3400, 1300, 2600, 1700];
const workHeader = tr(
  tc(workCols[0], p(run("Stt", { b: true }), { align: "center", after: 0 })) +
  tc(workCols[1], p(run("Nội dung công tác", { b: true }), { align: "center", after: 0 })) +
  tc(workCols[2], p(run("Kết quả", { b: true }), { align: "center", after: 0 })) +
  tc(workCols[3], p(run("Vật tư thay thế", { b: true }), { align: "center", after: 0 })) +
  tc(workCols[4], p(run("Ghi chú", { b: true }), { align: "center", after: 0 }))
);
const workRow = (content, result, material) => tr(
  tc(workCols[0], p(run(""), { after: 0 })) +
  tc(workCols[1], p(run(content), { after: 0 })) +
  tc(workCols[2], p(run(result), { align: "center", after: 0 })) +
  tc(workCols[3], p(run(material), { align: "center", after: 0 })) +
  tc(workCols[4], p(run(""), { after: 0 }))
);
const workTable = table(workCols, [
  workHeader,
  workRow("- Cô lập thiết bị", "Đạt", ""),
  workRow("", "Đạt", ""),
  workRow("", "Đạt", "{{materialSummary}}"),
  workRow("", "Đạt", ""),
  workRow("- Thu dọn dụng cụ, vật tư, vệ sinh sạch sẽ vị trí công tác.", "Đạt", ""),
  workRow("- Tái lập thiết bị, vận hành kiểm tra.", "Đạt", ""),
].join(""));

// Khối chữ ký (trang 2-3)
const signTable = table(
  [4850, 4850],
  tr(
    tc(4850, p(run("Phân Xưởng Vận Hành 1", { b: true }), { align: "center", after: 0 })) +
    tc(4850, p(run("Người lập", { b: true }), { align: "center", after: 0 }))
  ) +
  // Tag ảnh {%...} phải nằm MỘT MÌNH trong paragraph riêng (ràng buộc của image module);
  // tag điều kiện bọc ngoài đặt ở paragraph riêng để paragraphLoop gỡ sạch khi thiếu chữ ký.
  tr(
    tc(4850,
      p(run("{{#coChuKyQuanDoc}}"), { align: "center", after: 0 }) +
      p(run("{{%chuKyQuanDoc}}"), { align: "center", before: 60, after: 60 }) +
      p(run("{{/coChuKyQuanDoc}}"), { align: "center", after: 0 })) +
    tc(4850,
      p(run("{{#coChuKyNguoiLap}}"), { align: "center", after: 0 }) +
      p(run("{{%chuKyNguoiLap}}"), { align: "center", before: 60, after: 60 }) +
      p(run("{{/coChuKyNguoiLap}}"), { align: "center", after: 0 }))
  ) +
  tr(
    tc(4850, p(run("{{quanDocName}}", { b: true }), { align: "center", after: 0 })) +
    tc(4850, p(run("{{usedByName}}", { b: true }), { align: "center", after: 0 }))
  ) +
  tr(
    tc(4850, p(run(""), { after: 0 }) + p(run("Phòng Kỹ Thuật và an toàn", { b: true }), { align: "center", before: 240, after: 0 })) +
    tc(4850, p(run(""), { after: 0 }) + p(run("Phân Xưởng Sửa chữa Cơ nhiệt", { b: true }), { align: "center", before: 240, after: 0 }))
  ),
  { borders: false }
);

const body2 = [
  p(run("-") + tabR() + run("Thời gian chạy thử: theo bảng nội dung công tác dưới đây;"), { ind: 900 }),
  workTable,
  p(run("-") + tabR() + run("Những hư hỏng, sai sót, chưa hoàn thành: Không"), { ind: 900, before: 120 }),
  p(run("6.", { b: true }) + tabR() + run("Khối lượng vật tư, thiết bị:", { b: true })),
  p(run("Danh mục và khối lượng vật tư, thiết bị sử dụng, thu hồi và hoàn trả (Xem phụ lục 1 đính kèm).", { i: true }), { ind: 567 }),
  p(run("7.", { b: true }) + tabR() + run("Kết luận:", { b: true })),
  p(run("-") + tabR() + run("Đồng ý nghiệm thu lắp đặt, thí nghiệm chạy thử, hoàn thành để đưa vào sử dụng."), { ind: 567 }),
  p(run("-") + tabR() + run("Phân xưởng Vận hành 1 tiếp quản hệ thống/thiết bị kể trên kể từ {{workEndedAt}}./."), { ind: 567 }),
  p(run(""), { after: 120 }),
  signTable,
  p(run(""), { after: 120 }),
  p(run("Nơi nhận:", { b: true, i: true, sz: 22 }), { after: 0 }),
  p(run("- SCCN, KTAT;", { sz: 22 }), { after: 0 }),
  p(run("- Lưu: VH1, KH&VT;", { sz: 22 }), { after: 0 }),
].join("");

// ================= Phụ lục 1 (ngang) =================
const axCols = [560, 1500, 1700, 1300, 1400, 1700, 900, 1000, 800, 1050, 1050, 1050, 1050, 900];
const axHead = ["Stt", "Hệ thống", "Thiết bị", "Mã vật tư", "Vật tư", "Thông số kỹ thuật", "Mã hiệu", "Hãng/Xuất xứ", "Đơn vị", "Khối lượng vật tư, thiết bị lĩnh", "Khối lượng vật tư, thiết bị sử dụng", "Khối lượng vật tư, thiết bị thu hồi", "Khối lượng vật tư, thiết bị hoàn trả", "Ghi chú"];
const axHeaderRow = tr(axHead.map((h, idx) => tc(axCols[idx], p(run(h, { b: true, sz: 22 }), { align: "center", after: 0 }))).join(""));
const axCell = (idx, text) => tc(axCols[idx], p(run(text, { sz: 22 }), { align: "center", after: 0 }));
const axDataRow = tr(
  axCell(0, "{{#items}}{{stt}}") +
  axCell(1, "Hệ thống {{heThong}}") +
  axCell(2, "{{thietBi}}") +
  axCell(3, "{{maVatTu}}") +
  axCell(4, "{{tenVatTu}}") +
  axCell(5, "{{thongSoKyThuat}}") +
  axCell(6, "") +
  axCell(7, "{{xuatXu}}") +
  axCell(8, "{{donVi}}") +
  axCell(9, "{{khoiLuongLinh}}") +
  axCell(10, "{{khoiLuongSuDung}}") +
  axCell(11, "{{khoiLuongThuHoi}}") +
  axCell(12, "{{khoiLuongHoanTra}}") +
  axCell(13, "{{/items}}")
);
const appendix = [
  p(run("Phụ lục 1: Danh mục và khối lượng vật tư, thiết bị sử dụng, thu hồi và hoàn trả", { b: true }), { align: "center", after: 0 }),
  p(run("(Đính kèm Biên bản nghiệm thu lắp đặt, chạy thử và hoàn thành đưa vào sử dụng ngày {{ngayXuat}})", { i: true, sz: 22 }), { align: "center", after: 120 }),
  table(axCols, axHeaderRow + axDataRow),
].join("");

// Ngắt section: trang 1-3 dọc, phụ lục ngang
const portraitSect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709"/></w:sectPr>`;
const landscapeSect = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709"/></w:sectPr>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body1}${body2}<w:p><w:pPr>${portraitSect}</w:pPr></w:p>${appendix}${landscapeSect}</w:body></w:document>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
zip.folder("word").file("document.xml", documentXml);
zip.folder("word/_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);

const out = path.join(process.cwd(), "templates", "bbnt-do-template.docx");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Đã tạo", out);
