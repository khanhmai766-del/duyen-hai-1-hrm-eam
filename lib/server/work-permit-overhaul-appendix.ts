import PizZip from "pizzip";
import type { WorkPermit } from "@prisma/client";
import { formatPermitNumber, PERMIT_KINDS, PERMIT_UNITS } from "@/lib/work-permits";
import { overhaulItemsOf } from "@/lib/work-permit-overhaul";

/*
 * Phụ lục in kèm PCT giấy nhà thầu · Đại tu: bảng Mã hạng mục | Nội dung công việc | Biện pháp thi công của các
 * hạng mục đã chọn lúc cấp (ảnh chụp WorkPermit.overhaulItems). Trên phiếu chỉ ghi "… theo hạng mục 1.1.1, 1.1.2",
 * chi tiết nằm ở đây. Văn bản chỉ có tiêu đề + một bảng nên dựng thẳng WordprocessingML, không cần mẫu .docx.
 */

const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
const BORDER = '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
/** A4 ngang, lề 2 cm (twip). Bề rộng dùng được = 16838 − 2×1134 = 14570. */
const PAGE = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
const COLUMNS = [1900, 4870, 7800];

function xmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // Ký tự điều khiển làm Word báo tệp hỏng.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function run(text: string, { bold = false, size = 24, italic = false } = {}) {
  return `<w:r><w:rPr>${FONT}${bold ? "<w:b/><w:bCs/>" : ""}${italic ? "<w:i/><w:iCs/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function paragraph(runs: string, { align = "left", after = 0, keepNext = false } = {}) {
  return `<w:p><w:pPr>${keepNext ? "<w:keepNext/>" : ""}<w:spacing w:before="0" w:after="${after}" w:line="276" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr>${runs}</w:p>`;
}

/** Ô bảng: mỗi dòng của chữ (biện pháp thi công nhiều bước) thành một đoạn riêng. */
function cell(text: string, width: number, { bold = false, align = "left", shade = false } = {}) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const body = (lines.length ? lines : [""]).map(line => paragraph(run(line, { bold, size: 24 }), { align })).join("");
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : ""}<w:vAlign w:val="${shade ? "center" : "top"}"/></w:tcPr>${body}</w:tc>`;
}

function row(cells: string[], { header = false } = {}) {
  return `<w:tr><w:trPr><w:cantSplit/>${header ? "<w:tblHeader/>" : ""}</w:trPr>${cells.join("")}</w:tr>`;
}

export function hasOverhaulAppendix(permit: Pick<WorkPermit, "teamType" | "contractorScope" | "overhaulItems">) {
  return permit.teamType === "CONTRACTOR" && permit.contractorScope === "OVERHAUL" && overhaulItemsOf(permit.overhaulItems).length > 0;
}

export function overhaulAppendixFileName(permit: Pick<WorkPermit, "kind" | "year" | "number">) {
  return `Phu-luc-dai-tu-PCT-${permit.kind === "MECHANICAL" ? "Co" : "Dien"}-${permit.year}-${permit.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`;
}

export function createOverhaulAppendixDocument(permit: WorkPermit) {
  const items = overhaulItemsOf(permit.overhaulItems);
  const meta = [
    ["Số PCT", formatPermitNumber(permit)],
    ["Loại phiếu", `PCT ${PERMIT_KINDS[permit.kind as keyof typeof PERMIT_KINDS] ?? permit.kind} · Nhà thầu · Đại tu`],
    ["Đơn vị công tác", permit.teamName || "—"],
    ["Tổ máy", PERMIT_UNITS[permit.unit as keyof typeof PERMIT_UNITS] ?? permit.unit],
    ...(permit.position ? [["Cương vị", permit.position]] : []),
    ["Nội dung công việc", permit.content],
  ];
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${COLUMNS.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${COLUMNS.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`
    + row([cell("Mã hạng mục", COLUMNS[0], { bold: true, align: "center", shade: true }), cell("Nội dung công việc", COLUMNS[1], { bold: true, align: "center", shade: true }), cell("Biện pháp thi công", COLUMNS[2], { bold: true, align: "center", shade: true })], { header: true })
    + items.map(item => row([
      cell(item.code, COLUMNS[0], { bold: true, align: "center" }),
      cell([item.device, item.content].filter(Boolean).join("\n"), COLUMNS[1]),
      cell(item.method || "—", COLUMNS[2]),
    ])).join("")
    + "</w:tbl>";

  const body = [
    paragraph(run("PHỤ LỤC NỘI DUNG CÔNG VIỆC ĐẠI TU", { bold: true, size: 30 }), { align: "center", after: 60 }),
    paragraph(run(`Kèm theo Phiếu công tác số ${formatPermitNumber(permit)}`, { italic: true, size: 24 }), { align: "center", after: 200 }),
    ...meta.map(([label, value]) => paragraph(run(`${label}: `, { bold: true }) + run(value), { after: 40 })),
    paragraph("", { after: 120 }),
    table,
    paragraph(run(`Tổng số: ${items.length} hạng mục.`, { italic: true, size: 22 }), { after: 0 }),
    PAGE,
  ].join("");

  const zip = new PizZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
