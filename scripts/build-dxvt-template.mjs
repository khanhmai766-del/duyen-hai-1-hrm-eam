// Sinh templates/dxvt-template.docx — mẫu QLVT.12 "GIẤY ĐỀ NGHỊ XUẤT VẬT TƯ
// THIẾT BỊ SCTX" (Phiếu ĐXVT) theo mẫu PDF của phân xưởng.
// Chạy lại khi cần chỉnh cấu trúc mẫu: node scripts/build-dxvt-template.mjs
// Token {{...}} do lib/dxvt-doc.ts điền; {{%...}} là ảnh chữ ký số.
import PizZip from "pizzip";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FONT = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`;
const run = (text, { b = false, i = false, sz = 26, u = false } = {}) =>
  `<w:r><w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}${u ? `<w:u w:val="single"/>` : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const p = (runsXml, { align = "left", before = 0, after = 60, ind = 0 } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="264" w:lineRule="auto"/>` +
  (ind ? `<w:ind w:left="${ind}"/>` : "") +
  `<w:jc w:val="${align}"/></w:pPr>${runsXml}</w:p>`;

const BORDERS =
  `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/>` +
  `<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>`;

const table = (widths, rowsXml, { borders = true } = {}) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders ? BORDERS : ""}<w:tblLayout w:type="fixed"/></w:tblPr>` +
  `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rowsXml}</w:tbl>`;

const tc = (w, contentXml, { valign = "center", extra = "" } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${extra}<w:vAlign w:val="${valign}"/></w:tcPr>${contentXml}</w:tc>`;
const tr = (cellsXml) => `<w:tr>${cellsXml}</w:tr>`;

const NO_BORDER = `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>`;
const BOX = `<w:tcBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/></w:tcBorders>`;

// ================= Đầu trang =================
const headerTable = table(
  [4400, 3000, 2237],
  tr(
    tc(4400,
      p(run("CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI", { sz: 24 }), { align: "center", after: 0 }) +
      p(run("PHÂN XƯỞNG VẬN HÀNH 1", { b: true, sz: 24, u: true }), { align: "center", after: 0 }) +
      p(run("Số: ……/PXVH1", { sz: 24 }), { align: "center", after: 0 }),
      { extra: NO_BORDER }) +
    tc(3000, p(run(""), { after: 0 }) + p(run(""), { after: 0 }), { extra: NO_BORDER }) +
    tc(2237, p(run("QLVT.12", { b: true }), { align: "center", after: 0 }), { extra: BOX })
  ),
  { borders: false }
);

// ================= Bảng vật tư (header 2 tầng, gộp ô) =================
const cols = [560, 1650, 3050, 800, 950, 800, 850, 950, 800];
const SPAN = (n) => `<w:gridSpan w:val="${n}"/>`;
const VM_START = `<w:vMerge w:val="restart"/>`;
const VM_CONT = `<w:vMerge/>`;
const headerRow1 = tr(
  tc(cols[0], p(run("STT", { b: true, i: true, sz: 22 }), { align: "center", after: 0 }), { extra: VM_START }) +
  tc(cols[1] + cols[2] + cols[3] + cols[4], p(run("Yêu cầu cấp phát", { b: true, i: true, sz: 22 }), { align: "center", after: 0 }), { extra: SPAN(4) }) +
  tc(cols[5] + cols[6], p(run("Đối chiếu hệ thống", { b: true, i: true, sz: 22 }), { align: "center", after: 0 }), { extra: SPAN(2) }) +
  tc(cols[7] + cols[8], p(run("Xác nhận của người lãnh vật tư", { b: true, i: true, sz: 22 }), { align: "center", after: 0 }), { extra: SPAN(2) })
);
const headerRow2 = tr(
  tc(cols[0], p(run(""), { after: 0 }), { extra: VM_CONT }) +
  tc(cols[1], p(run("Mã VTTB", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[2], p(run("Tên, nhãn hiệu, quy cách, phẩm chất VTTB", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[3], p(run("ĐVT", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[4], p(run("Số lượng", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[5], p(run("Kho VTTB", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[6], p(run("Tồn kho", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[7], p(run("Số lượng thực nhận", { b: true, i: true, sz: 22 }), { align: "center", after: 0 })) +
  tc(cols[8], p(run("Ký nhận", { b: true, i: true, sz: 22 }), { align: "center", after: 0 }))
);
const cell = (idx, text) => tc(cols[idx], p(run(text, { sz: 22 }), { align: "center", after: 0 }));
const dataRow = tr(
  cell(0, "{{#items}}{{stt}}") +
  cell(1, "{{maVatTu}}") +
  cell(2, "{{tenVatTu}}") +
  cell(3, "{{donVi}}") +
  cell(4, "{{soLuong}}") +
  cell(5, "") + cell(6, "") + cell(7, "") +
  cell(8, "{{/items}}")
);

// ================= Khối chữ ký (3 cột) =================
const signTable = table(
  [3245, 3245, 3247],
  tr(
    tc(3245, p(run("KT. TRƯỞNG PHÒNG KHVT", { b: true }), { align: "center", after: 0 }) + p(run("PHÓ TRƯỞNG PHÒNG", { b: true }), { align: "center", after: 0 }), { extra: NO_BORDER, valign: "top" }) +
    tc(3245, p(run("QUẢN ĐỐC PXVH 1", { b: true }), { align: "center", after: 0 }), { extra: NO_BORDER, valign: "top" }) +
    tc(3247, p(run("NGƯỜI ĐỀ NGHỊ", { b: true }), { align: "center", after: 0 }), { extra: NO_BORDER, valign: "top" })
  ) +
  // Tag ảnh {%...} phải nằm MỘT MÌNH trong paragraph riêng (ràng buộc image module);
  // tag điều kiện bọc ngoài ở paragraph riêng để paragraphLoop gỡ sạch khi thiếu chữ ký.
  tr(
    tc(3245, p(run(""), { after: 0 }), { extra: NO_BORDER }) +
    tc(3245,
      p(run("{{#coChuKyQuanDoc}}"), { align: "center", after: 0 }) +
      p(run("{{%chuKyQuanDoc}}"), { align: "center", before: 60, after: 60 }) +
      p(run("{{/coChuKyQuanDoc}}"), { align: "center", after: 0 }),
      { extra: NO_BORDER }) +
    tc(3247,
      p(run("{{#coChuKyThongKe}}"), { align: "center", after: 0 }) +
      p(run("{{%chuKyThongKe}}"), { align: "center", before: 60, after: 60 }) +
      p(run("{{/coChuKyThongKe}}"), { align: "center", after: 0 }),
      { extra: NO_BORDER })
  ) +
  tr(
    tc(3245, p(run("Nguyễn Quang Nhã", { b: true }), { align: "center", before: 240, after: 0 }), { extra: NO_BORDER }) +
    tc(3245, p(run("{{quanDocName}}", { b: true }), { align: "center", before: 240, after: 0 }), { extra: NO_BORDER }) +
    tc(3247, p(run("{{tenThongKe}}", { b: true }), { align: "center", before: 240, after: 0 }), { extra: NO_BORDER })
  ),
  { borders: false }
);

const body = [
  headerTable,
  p(run("Vĩnh Long, ngày …… tháng …… năm ………", { i: true, sz: 24 }), { align: "right", after: 60 }),
  p(run("GIẤY ĐỀ NGHỊ XUẤT VẬT TƯ THIẾT BỊ SCTX", { b: true, sz: 28 }), { align: "center", after: 0 }),
  p(run("Theo biểu nhu cầu được duyệt Tháng {{thang}}", { i: true, sz: 24 }), { align: "center", after: 120 }),
  p(run("Kính gửi", { b: true, u: true }) + run(": ", { b: true }) + run("Phòng Kế Hoạch và Vật tư", { b: true }), { align: "center", after: 120 }),
  p(run("Họ tên người nhận vật tư: {{tenThongKe}} – BPSD: PXVH1.")),
  p(run("Đề nghị Phòng Kế hoạch & Vật tư cho nhận một số vật tư dưới đây:")),
  p(run("Lý do xuất vật tư: {{Lydo}}. {{soBBKT}}.")),
  p(run("Thuộc công trình/nguồn vốn: SXKD DH1.")),
  table(cols, headerRow1 + headerRow2 + dataRow),
  p(run("Trân trọng./."), { before: 120, after: 120 }),
  signTable,
  p(run(""), { after: 60 }),
  p(run("Nơi nhận:", { b: true, i: true, sz: 22 }), { after: 0 }),
  p(run("- Như trên;", { sz: 22 }), { after: 0 }),
  p(run("- Lưu: PXVH1, KHVT.", { sz: 22 }), { after: 0 }),
].join("");

const portraitSect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709"/></w:sectPr>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}${portraitSect}</w:body></w:document>`;

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

const out = path.join(process.cwd(), "templates", "dxvt-template.docx");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Đã tạo", out);
