// Sinh templates/bbthvt-template.docx — mẫu QLVT.06 "BIÊN BẢN GIAO NHẬN VẬT TƯ
// THIẾT BỊ THU HỒI SAU SỬA CHỮA" (BBTHVT) theo mẫu PDF của phân xưởng.
// Chạy lại khi cần chỉnh cấu trúc mẫu: node scripts/build-bbthvt-template.mjs
// Token {{...}} do lib/bbthvt-doc.ts điền bằng docxtemplater; bảng lặp theo {{#items}}.
import PizZip from "pizzip";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FONT = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`;
const run = (text, { b = false, i = false, sz = 24, u = false, vert = null } = {}) =>
  `<w:r><w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}${u ? `<w:u w:val="single"/>` : ""}${vert ? `<w:vertAlign w:val="${vert}"/>` : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const tabR = () => `<w:r><w:tab/></w:r>`;

const p = (runsXml, { align = "left", before = 0, after = 60, ind = 0, hang = 0 } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="264" w:lineRule="auto"/>` +
  (ind || hang ? `<w:ind w:left="${ind}"${hang ? ` w:hanging="${hang}"` : ""}/>` : "") +
  `<w:jc w:val="${align}"/></w:pPr>${runsXml}</w:p>`;

const BORDERS =
  `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>`;

const table = (widths, rowsXml, { borders = true } = {}) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders ? BORDERS : ""}<w:tblLayout w:type="fixed"/></w:tblPr>` +
  `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rowsXml}</w:tbl>`;

const tc = (w, contentXml, { valign = "center", borders = null } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${borders ?? ""}<w:vAlign w:val="${valign}"/></w:tcPr>${contentXml}</w:tc>`;
const tr = (cellsXml) => `<w:tr>${cellsXml}</w:tr>`;

const NO_BORDER = `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>`;
const BOX = `<w:tcBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/></w:tcBorders>`;

// ================= Đầu trang: header trái + ô QLVT.06 =================
const headerTable = table(
  [10500, 2000, 2070],
  tr(
    tc(10500,
      p(run("TỔNG CÔNG TY PHÁT ĐIỆN 1", { sz: 24 }), { align: "center", after: 0 }) +
      p(run("CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI", { b: true, sz: 24, u: true }), { align: "center", after: 0 }) +
      p(run("Số: {{soVB}}/ PXVH1 BBVTTH - SCTX", { sz: 24 }), { align: "center", after: 0 }),
      { borders: NO_BORDER }) +
    tc(2000, p(run(""), { after: 0 }), { borders: NO_BORDER }) +
    tc(2070, p(run("QLVT.06", { b: true }), { align: "center", after: 0 }), { borders: BOX, valign: "center" })
  ),
  { borders: false }
);

// ================= Bảng danh mục vật tư thu hồi =================
const cols = [700, 1600, 2600, 900, 1000, 1300, 1400, 1300, 1400, 1200, 1170];
const head = [
  ["STT", ""], ["Mã vật tư", ""], ["Tên, nhãn hiệu, quy cách vật tư", ""], ["ĐVT", "2"], ["Số lượng", "3"],
  ["Tổng trọng lượng quy đổi (kg)", "4"], ["Tình trạng vật tư", "5"], ["Số Phiếu giao hàng", "6"],
  ["Mác vật liệu", "7"], ["Phân loại", "8"], ["Ghi chú", "9"],
];
const headerRow = tr(head.map(([label, note], idx) =>
  tc(cols[idx], p(run(label, { b: true, i: true, sz: 22 }) + (note ? run(note, { b: true, i: true, sz: 22, vert: "superscript" }) : ""), { align: "center", after: 0 }))
).join(""));
const cell = (idx, text, opts = {}) => tc(cols[idx], p(run(text, { sz: 22 }), { align: "center", after: 0, ...opts }));
const dataRow = tr(
  cell(0, "{{#items}}{{stt}}") +
  cell(1, "{{maVatTu}}") +
  cell(2, "{{tenVatTu}}") +
  cell(3, "{{donVi}}") +
  cell(4, "{{soLuongThuHoi}}") +
  cell(5, "") +
  cell(6, "Đã qua sử dụng") +
  cell(7, "{{deliveryNote}}") +
  cell(8, "{{macVatTu}}") +
  cell(9, "{{phanLoai}}") +
  cell(10, "{{ghiChu}}{{/items}}")
);

// ================= Ghi chú chân trang (footnotes 1-9) =================
const footnotes = [
  ["1", " Áp dụng cho SCTX, SCL. Đối với SCL ghi cụ thể tên/mã công trình, hạng mục."],
  ["2", " Theo đơn vị tính của Phiếu giao hàng"],
  ["3", " Ghi theo số lượng của đơn vị tính."],
  ["4", " Trọng lượng thực tế của VTTB tại thời điểm thu hồi/bàn giao."],
  ["5", " Ghi rõ tình trạng: Vật tư đã qua sử dụng, hư hỏng, hao hụt, mài mòn trong quá trình vận hành…"],
  ["6", " Nộp kèm bản photo Phiếu Giao hàng"],
  ["7", " Mác vật liệu: Theo đúng thực tế nhận: Sắt, đồng, nhôm, inox, cao su, nhựa, dầu thải, giẻ lau… đối với VTTB chưa xác định là vật liệu gì ghi không xác định (KXĐ). Các loại vật tư không trả thu hồi nhưng bao bì là chất thải nguy hại, chất thải rắn ghi: Trả vỏ hộp, trả vỏ chai, trả vỏ thùng, trả vỏ phuy… (Trường hợp VTTB thu hồi khác với VTTB xuất kho ghi chú VTTB thay ra từ thiết bị là …)"],
  ["8", " Phân loại: Sắt, đồng, nhôm, inox ghi chú phế liệu; dầu thải, mỡ, vỏ thùng sơn, vỏ RP7, bóng đèn, pin… ghi chú chất thải nguy hại (CTNH); gỗ, nhựa, cát… các thành phần không chứa nguy hại ghi chú chất thải công nghiệp thông thường (CTCN); Đối với vật tư lắp mới ghi chú “Lắp mới không có vật tư thu hồi”; Các loại vật tư như cồn, xăng, dầu DO, các loại băng keo… ghi Tiêu hao"],
  ["9", " Ghi chú: Trường hợp trả VTTB thu hồi của cùng 1 công trình nhưng các hạng mục thi công khác nhau. Ghi từng hạng mục VTTB trả thu hồi"],
].map(([n, text]) => p(run(n, { i: true, sz: 16, vert: "superscript" }) + run(text, { i: true, sz: 16 }), { after: 0 })).join("");

// ================= Khối chữ ký =================
const signTable = table(
  [7280, 7290],
  tr(
    tc(7280, p(run("BÊN GIAO VTTB", { b: true }), { align: "center", after: 0 }) + p(run(""), { after: 0 }) + p(run(""), { after: 0 }) + p(run("Phan Minh Hải", { b: true }), { align: "center", before: 240, after: 0 })) +
    tc(7290, p(run("BÊN NHẬN VTTB", { b: true }), { align: "center", after: 0 }) + p(run(""), { after: 0 }) + p(run(""), { after: 0 }) + p(run("Phùng Đức Quang", { b: true, i: true }), { align: "center", before: 240, after: 0 }))
  )
);

const body = [
  headerTable,
  p(run("BIÊN BẢN GIAO NHẬN", { b: true, sz: 26 }), { align: "center", before: 120, after: 0 }),
  p(run("VẬT TƯ THIẾT BỊ THU HỒI SAU SỬA CHỮA", { b: true, sz: 26 }) + run("1", { b: true, sz: 26, vert: "superscript" }), { align: "center", after: 120 }),
  p(run("Thuộc công trình: Sửa chữa thường xuyên Nhà máy Duyên Hải 1")),
  p(run("Hôm nay, lúc 08 giờ 00 phút ngày …… tháng …… năm ………, tại Kho Công ty Nhiệt điện Duyên Hải, chúng tôi gồm:")),
  p(run("I. Bên giao: ", { b: true }) + run("Phân xưởng Vận hành 1.", { b: true })),
  p(run("-") + tabR() + run("Ông: Phan Minh Hải, chức vụ: KTV"), { ind: 567 }),
  p(run("II. Bên nhận: ", { b: true }) + run("Phòng kế hoạch vật tư", { b: true })),
  p(run("-") + tabR() + run("Ông: Phùng Đức Quang, chức vụ Tổ trưởng tổ kho"), { ind: 567 }),
  p(run("Cùng xác nhận khối lượng VTTB thu hồi bàn giao cho Phòng/Phân xưởng với các nội dung cụ thể như sau:")),
  table(cols, headerRow + dataRow),
  p(run(""), { after: 40 }),
  footnotes,
  p(run("III. Ý KIẾN ĐỀ XUẤT", { b: true }), { before: 120 }),
  p(run("………………………………………………………………………………………………………………………………………………")),
  p(run("Biên bản được lập làm 03 bản. Bên giao giữ 02 bản, bên nhận giữ 01 bản dùng làm cơ sở thực hiện các thủ tục tiếp theo.")),
  signTable,
].join("");

const landscapeSect = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709"/></w:sectPr>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}${landscapeSect}</w:body></w:document>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
zip.folder("word").file("document.xml", documentXml);
zip.folder("word/_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);

const out = path.join(process.cwd(), "templates", "bbthvt-template.docx");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Đã tạo", out);
