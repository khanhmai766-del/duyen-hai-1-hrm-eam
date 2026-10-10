import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import { prisma } from "@/lib/prisma";
import type { WorkPermit } from "@prisma/client";
import { formatPermitNumber, PERMIT_DISCIPLINES } from "@/lib/work-permits";
import { safetyPrintData, type SafetySelection } from "@/lib/work-permit-safety";
import { assertPrintFilled, escapeHtml, fillPrintTable, loadPrintTemplate, replacePrintParagraph, replacePrintParagraphMarkup } from "@/lib/print-html";
import { workPermitQrPrintImage } from "@/lib/work-permit-qr";

import { workPermitQrAssets } from "@/lib/server/work-permit-qr";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
const DEFAULT_RUN_PROPERTIES = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
function plain(xml: string) { return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join(""); }
function firstTag(xml: string, tag: "pPr" | "rPr" | "tcPr") { return xml.match(new RegExp(`<w:${tag}\\b[^>]*>[\\s\\S]*?<\\/w:${tag}>`))?.[0] ?? ""; }
function normalizedRunProperties(properties: string) {
  if (!properties) return DEFAULT_RUN_PROPERTIES;
  if (/<w:rFonts\b/.test(properties)) return properties;
  return properties.replace(/<w:rPr\b[^>]*>/, '$&<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/>');
}
/**
 * Định dạng chữ lấy từ run đầu tiên có nội dung, không lấy `<w:rPr>` đầu tiên của đoạn: đó thường là
 * định dạng dấu cuối đoạn (nằm trong `<w:pPr>`), có thể khác cỡ chữ thật (dòng "Số ĐK" mẫu Cơ: dấu
 * cuối đoạn 12pt, chữ 10pt).
 */
function textRunProperties(xml: string) {
  return xml.match(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?(<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>)(?:(?!<\/w:r>)[\s\S])*?<w:(?:t|tab)\b/)?.[1] ?? firstTag(xml, "rPr");
}
function paragraph(text: string, properties = "", runProperties = DEFAULT_RUN_PROPERTIES) {
  return `<w:p>${properties}<w:r>${normalizedRunProperties(runProperties)}${text.split("\n").map((line, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${escape(line)}</w:t>`).join("")}</w:r></w:p>`;
}
/** Dòng trống để ghi tay bổ sung mối nguy/biện pháp sau khi in; cao tối thiểu ~0,8 cm cho đủ chỗ viết. */
const BLANK_SAFETY_ROWS = 3;
const BLANK_ROW_HEIGHT = '<w:trHeight w:val="454" w:hRule="atLeast"/>';
/** Clone the original row's cell geometry, permitting long safety text to wrap. */
function fillRow(template: string, values: string[], rowProperties = "") {
  let index = 0;
  let row = template.replace(/<w:trHeight\b[^>]*\/>/g, "").replace(/<w:tblHeader\b[^>]*\/>/g, "");
  if (!row.includes("<w:cantSplit")) row = row.includes("</w:trPr>") ? row.replace("</w:trPr>", "<w:cantSplit/></w:trPr>") : row.replace(/(<w:tr\b[^>]*>)/, "$1<w:trPr><w:cantSplit/></w:trPr>");
  if (rowProperties) row = row.replace("</w:trPr>", `${rowProperties}</w:trPr>`);
  const result = row.replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, cell => {
    const value = values[index++] ?? "";
    return `<w:tc>${firstTag(cell, "tcPr")}${paragraph(value, firstTag(cell, "pPr"), textRunProperties(cell))}</w:tc>`;
  });
  if (index !== values.length) throw new Error("Số cột của mẫu PCT không khớp. Vui lòng kiểm tra lại mẫu.");
  return result;
}
function fillTable(xml: string, header: string, values: string[][]) {
  let matches = 0;
  const result = xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, table => {
    const rows = table.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g);
    if (!rows || !plain(rows[0]).includes(header)) return table;
    matches++;
    if (!rows[1]) throw new Error("Mẫu PCT thiếu dòng bảng an toàn");
    const first = table.indexOf(rows[0]), last = table.lastIndexOf(rows[rows.length - 1]) + rows[rows.length - 1].length;
    // Các bảng an toàn in đúng các mục người dùng đã chọn/phân công, rồi chừa thêm
    // BLANK_SAFETY_ROWS dòng trống (STT đánh tiếp) để ghi tay bổ sung tại hiện trường.
    // STT được sinh lại độc lập từ 1 theo số hàng của từng bảng.
    const headerRow = rows[0].includes("w:tblHeader") ? rows[0] : (rows[0].includes("</w:trPr>") ? rows[0].replace("</w:trPr>", "<w:tblHeader/></w:trPr>") : rows[0].replace(/(<w:tr\b[^>]*>)/, "$1<w:trPr><w:tblHeader/></w:trPr>"));
    const cells = rows[1].match(/<w:tc\b/g)?.length ?? 0;
    const blanks = Array.from({ length: BLANK_SAFETY_ROWS }, (_, i) => fillRow(rows[1], [String(values.length + i + 1), ...Array<string>(Math.max(0, cells - 1)).fill("")], BLANK_ROW_HEIGHT));
    return table.slice(0, first) + headerRow + values.map((value, index) => fillRow(rows[1], [String(index + 1), ...value])).join("") + blanks.join("") + table.slice(last);
  });
  if (matches !== 1) throw new Error(`Không xác định được bảng ${header} trong mẫu PCT`);
  return result;
}
/** `value` là hàm thì nhận nguyên XML đoạn gốc và trả về đoạn thay thế. */
function replaceParagraph(xml: string, startsWith: string, value: string | ((p: string) => string)) {
  let done = false;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    if (done || !plain(p).trim().startsWith(startsWith)) return p;
    done = true;
    return typeof value === "function" ? value(p) : paragraph(value, firstTag(p, "pPr"), textRunProperties(p));
  });
}
/**
 * Hàng chuyên môn Thủy/Cơ/Nhiệt/Hóa: căn giữa ĐÚNG dưới ô "PHIẾU CÔNG TÁC" (cột giữa bảng đầu phiếu)
 * và giãn bằng dấu cách cố định. Không dùng tab của mẫu vì bản xem trên trình duyệt (docx-preview)
 * tính tab khác Word; dấu cách cùng phông thì Word và trình duyệt rộng như nhau.
 */
const DISCIPLINE_GAP = " ".repeat(16);
function disciplineParagraph(xml: string, p: string, selected: string[]) {
  const table = xml.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/)?.[0] ?? "";
  const cols = [...(table.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] ?? "").matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)].map(m => Number(m[1]));
  const section = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)?.pop() ?? "";
  const attr = (tag: string, name: string) => Number(section.match(new RegExp(`<w:${tag}\\b[^>]*w:${name}="(\\d+)"`))?.[1] ?? 0);
  const width = attr("pgSz", "w") - attr("pgMar", "left") - attr("pgMar", "right");
  // Đoạn căn giữa có tâm = (lề trái + (width - lề phải)) / 2; chọn lề để tâm trùng tâm cột giữa.
  const center = cols.length === 3 && width > 0 ? Number(table.match(/<w:tblInd\b[^>]*w:w="(-?\d+)"/)?.[1] ?? 0) + cols[0] + cols[1] / 2 : null;
  const indent = center === null ? '<w:ind w:left="0" w:right="0" w:firstLine="0"/>'
    : `<w:ind w:left="${Math.max(0, Math.round(2 * center - width))}" w:right="${Math.max(0, Math.round(width - 2 * center))}" w:firstLine="0"/>`;
  let properties = firstTag(p, "pPr").replace(/<w:ind\b[^>]*\/>/, "").replace(/<w:jc\b[^>]*\/>/, "").replace(/<w:tabs>[\s\S]*?<\/w:tabs>/, "");
  // Thứ tự con trong pPr theo lược đồ OOXML: ind đứng trước jc, cả hai trước rPr của dấu cuối đoạn.
  properties = properties.includes("<w:rPr") ? properties.replace(/<w:rPr\b/, `${indent}<w:jc w:val="center"/>$&`) : properties.replace("</w:pPr>", `${indent}<w:jc w:val="center"/></w:pPr>`);
  const text = Object.entries(PERMIT_DISCIPLINES).map(([key, label]) => `[${selected.includes(key) ? "X" : "  "}] ${label}`).join(DISCIPLINE_GAP);
  return paragraph(text, properties, textRunProperties(p));
}

/**
 * Ba ô không viền giữ Tên / Chữ ký / Ngày giờ trên đúng một hàng ở mọi trình đọc Word.
 * Không nén ngang hoặc hạ cỡ chữ vì hai cách đó làm phông khác hẳn phần còn lại của mẫu.
 */
function signatureLineParagraph(p: string, label: string, name: string, moment: string) {
  const runProperties = normalizedRunProperties(textRunProperties(p))
    .replace(/<w:sz\b[^>]*\/>/g, '<w:sz w:val="24"/>')
    .replace(/<w:szCs\b[^>]*\/>/g, '<w:szCs w:val="24"/>')
    .replace(/<w:w\b[^>]*\/>/g, "");
  const [datePart, timePart = ""] = moment.split(" Giờ ");
  const run = (text: string) => `<w:r>${runProperties}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;
  const spacing = firstTag(p, "pPr").match(/<w:spacing\b[^>]*\/>/)?.[0] ?? "";
  const fields = [
    { width: 4250, text: `${label}: ${name || ".".repeat(18)}` },
    { width: 2100, text: `Chữ ký: ${".".repeat(8)}` },
    { width: 3550, text: `${datePart} Giờ ${timePart}` },
  ];
  const cells = fields.map(field => `<w:tc><w:tcPr><w:tcW w:w="${field.width}" w:type="dxa"/><w:noWrap/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr>${spacing}<w:jc w:val="left"/></w:pPr>${run(field.text)}</w:p></w:tc>`).join("");
  const widths = fields.map(field => field.width);
  const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9900" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="-284" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`;
}

function signatureLineHtml(label: string, name: string, moment: string) {
  const cell = (value: string) => `<span style="white-space:nowrap">${escapeHtml(value)}</span>`;
  const blank = (value: string) => `<span style="white-space:nowrap;border-bottom:1px dotted currentColor">${escapeHtml(value)}</span>`;
  const [datePart, timePart = ""] = moment.split(" Giờ ");
  return `<span style="display:grid;grid-template-columns:17.7% 26% 9.4% 8% 23% 15.9%;align-items:baseline;font-size:12pt">${cell(`${label}:`)}${blank(name)}${cell("Chữ ký:")}${blank("")}${cell(datePart)}${cell(`Giờ ${timePart}`)}</span>`;
}
/**
 * Như `replaceParagraph` nhưng chỉ tìm SAU đoạn mở đầu bằng `heading` — dùng cho các dòng
 * "Họ và tên…" giống nhau dưới từng mục ký (ví dụ Người giám sát an toàn điện của mẫu Điện).
 */
function replaceParagraphAfter(xml: string, heading: string, startsWith: string, value: string) {
  const at = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].find(m => plain(m[0]).trim().startsWith(heading));
  if (!at) return xml;
  const from = at.index! + at[0].length;
  return xml.slice(0, from) + replaceParagraph(xml.slice(from), startsWith, value);
}
function timeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year"), hour: get("hour"), minute: get("minute") };
}
function plannedTime(date: Date | null) {
  if (!date) return "…… giờ …… ngày ……/……/………";
  const t = timeParts(date);
  return `${t.hour} giờ ${t.minute} ngày ${t.day}/${t.month}/${t.year}`;
}
function plannedDayHour(date: Date | null) {
  if (!date) return "ngày ……/……/………. Thời gian: …… giờ …… phút";
  const t = timeParts(date);
  return `ngày ${t.day}/${t.month}/${t.year}. Thời gian: ${t.hour} giờ ${t.minute} phút`;
}
function signatureMoment(date: Date | null) {
  if (!date) return "Ngày ……/……/……… Giờ ……h……";
  const t = timeParts(date);
  return `Ngày ${t.day}/${t.month}/${t.year} Giờ ${t.hour}h${t.minute}`;
}
function compactSignatureMoment(date: Date | null) {
  if (!date) return "Ngày ..../..../...... Giờ ....h....";
  const t = timeParts(date);
  return `Ngày ${t.day}/${t.month}/${t.year} Giờ ${t.hour}h${t.minute}`;
}
function ensureNoTemplateTags(xml: string) {
  const tags = [...plain(xml).matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim());
  if (tags.length) throw new Error(`Mẫu PCT còn thẻ chưa được điền: ${[...new Set(tags)].join(", ")}`);
}

const QR_SIZE_EMU = 900_000; // 2,5 cm, có vùng trắng quanh mã để quét trên phiếu giấy.
const QR_RELATIONSHIP_ID = "rIdWorkPermitQr";
const QR_MEDIA_PATH = "word/media/work-permit-qr.png";

function hasOverhaulQr(row: WorkPermit) {
  return Boolean(row.id) && row.teamType === "CONTRACTOR" && row.contractorScope === "OVERHAUL";
}


function qrImageParagraph() {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${QR_SIZE_EMU}" cy="${QR_SIZE_EMU}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="9001" name="Mã QR PCT Đại tu"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="work-permit-qr.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${QR_RELATIONSHIP_ID}"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdWorkPermitQrSvg"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${QR_SIZE_EMU}" cy="${QR_SIZE_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** QR nằm trong chân trang đầu, không lặp ở các trang tiếp theo. */
async function addOverhaulFirstPageQr(zip: PizZip, xml: string, row: WorkPermit, qrOrigin?: string) {
  const assets = await workPermitQrAssets(row, qrOrigin);
  zip.file(QR_MEDIA_PATH, assets.png);
  zip.file("word/media/work-permit-qr.svg", assets.svg);
  const footerPath = "word/footer-overhaul-qr.xml";
  zip.file(footerPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${qrImageParagraph()}</w:ftr>`);
  zip.file("word/_rels/footer-overhaul-qr.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${QR_RELATIONSHIP_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/work-permit-qr.png"/><Relationship Id="rIdWorkPermitQrSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/work-permit-qr.svg"/></Relationships>`);
  const relationshipsPath = "word/_rels/document.xml.rels";
  const relationships = zip.file(relationshipsPath)?.asText();
  if (!relationships) throw new Error("Mẫu PCT thiếu quan hệ tài liệu Word");
  zip.file(relationshipsPath, relationships.replace("</Relationships>", '<Relationship Id="rIdOverhaulQrFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer-overhaul-qr.xml"/></Relationships>'));
  const typesPath = "[Content_Types].xml";
  let types = zip.file(typesPath)?.asText();
  if (!types) throw new Error("Mẫu PCT thiếu khai báo kiểu nội dung");
  if (!/<Default\b[^>]*Extension="png"/i.test(types)) types = types.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
  if (!/<Default\b[^>]*Extension="svg"/i.test(types)) types = types.replace("</Types>", '<Default Extension="svg" ContentType="image/svg+xml"/></Types>');
  types = types.replace("</Types>", '<Override PartName="/word/footer-overhaul-qr.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  zip.file(typesPath, types);
  xml = xml.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/, section => {
    section = section.replace(/<w:footerReference\b[^>]*w:type="first"[^>]*\/>/g, "");
    section = section.replace(/(<w:sectPr\b[^>]*>)/, '$1<w:footerReference w:type="first" r:id="rIdOverhaulQrFooter"/>');
    if (!section.includes("<w:titlePg")) section = section.replace(/(<w:docGrid\b|<\/w:sectPr>)/, "<w:titlePg/>$1");
    // Lề dưới đủ chứa QR 2,5 cm + 5 mm khoảng cách mép giấy, không đè nội dung phiếu.
    return section.replace(/(<w:pgMar\b[^>]*w:bottom=")[^"]+/, (_match, prefix: string) => `${prefix}1984`)
      .replace(/(<w:pgMar\b[^>]*w:footer=")[^"]+/, (_match, prefix: string) => `${prefix}283`);
  });
  return xml;
}

async function addOverhaulQrHtml(html: string, row: WorkPermit, qrOrigin?: string) {
  const src = `data:image/svg+xml;base64,${Buffer.from((await workPermitQrAssets(row, qrOrigin)).svg).toString("base64")}`;
  const printSrc = workPermitQrPrintImage(src);
  // Chân trang của riêng trang đầu: vùng QR dành sẵn 35 mm, ảnh 25 mm cách mép dưới 5 mm.
  const css = `<style>@page sheet0 { margin-bottom:35mm; } @page sheet0:first { @bottom-right { content:url("${printSrc}");text-align:right;vertical-align:bottom;padding-bottom:5mm; } }
  .overhaul-first-page-qr { position:absolute;right:var(--pad-r);top:calc(var(--paper-h) - 30mm);width:25mm;height:25mm; }
  .sheet0 { position:relative; }
  @media print { .overhaul-first-page-qr { display:none; } }</style>`;
  html = html.replace("</head>", `${css}</head>`).replace(/(<section class="sheet sheet0"[^>]*>)/, `$1<img class="overhaul-first-page-qr" alt="Mã QR PCT Đại tu" src="${src}"/>`);
  return html;
}

export async function createWorkPermitDocument(row: WorkPermit, qrOrigin?: string) {
  const mechanical = row.kind === "MECHANICAL";
  const zip = new PizZip(await fs.readFile(path.join(process.cwd(), "templates", mechanical ? "work-permit-mechanical.docx" : "work-permit-electrical.docx")));
  let xml = zip.file("word/document.xml")!.asText();
  const selected = (Array.isArray(row.safetyItems) ? row.safetyItems : []) as unknown as SafetySelection[];
  const groups = safetyPrintData(selected), number = formatPermitNumber(row);
  // Cả hai mẫu: "Số:" và "Số ĐK:" là hai dòng riêng ở góc phải đầu phiếu; không có ĐKCT thì để trống dòng.
  xml = replaceParagraph(xml, "Số:", `Số: ${number}`);
  xml = replaceParagraph(xml, "Số ĐK:", row.registrationNumber.trim() ? `Số ĐK: ${row.registrationNumber.trim()}` : "");
  if (mechanical) {
    xml = fillTable(xml, "Nhận diện mối nguy", groups.hazards.map(r => [r.hazard, r.measure]));
    xml = fillTable(xml, "Kiểm tra các biện pháp an toàn đơn vị cho phép", groups.authorization.map(s => [s, "", ""]));
    xml = fillTable(xml, "Kiểm tra các biện pháp an toàn đơn vị công tác", groups.execution.map(s => [s, "", ""]));
    xml = replaceParagraph(xml, "Địa điểm:", `Địa điểm: ${row.location}`);
    xml = replaceParagraph(xml, "Nội dung:", `Nội dung: ${row.content}`);
    xml = replaceParagraph(xml, "Phạm vi:", `Phạm vi: ${row.workScope || "……………………………………………………"}`);
    xml = replaceParagraph(xml, "[  ] Thủy", p => disciplineParagraph(xml, p, row.disciplines));
    xml = replaceParagraph(xml, "Thời gian:", `Thời gian: Từ ${plannedTime(row.plannedStartAt)} đến ${plannedTime(row.plannedEndAt)}`);
    const compactAuthorizationMoment = compactSignatureMoment(row.authorizedAt);
    xml = replaceParagraph(xml, "Người cấp phiếu:", `Người cấp phiếu: ${row.issuerName || "…………"}       Chữ ký: ……………       ${signatureMoment(row.issuedAt)}`);
    xml = replaceParagraph(xml, "Người cho phép:", p => signatureLineParagraph(p, "Người cho phép", row.authorizerName, compactAuthorizationMoment));
    // Tên CHTT và số lượng người được xác nhận, ghi trực tiếp trên phiếu giấy tại hiện trường.
    xml = replaceParagraph(xml, "Người CHTT:", p => signatureLineParagraph(p, "Người CHTT", "", compactAuthorizationMoment));
    xml = replaceParagraph(xml, "Đơn vị công tác:", `Đơn vị công tác: ${row.teamName}       Số lượng người: …………`);
  } else {
    xml = replaceParagraph(xml, "1.1.", `1.1. Người lãnh đạo công việc (nếu có): ${row.leaderName}`);
    xml = replaceParagraph(xml, "1.2.", "1.2. Người chỉ huy trực tiếp: …………………………………………………………");
    xml = replaceParagraph(xml, "1.3.", `1.3. Nhân viên đơn vị công tác: ${row.printWorkerCount ?? "…………"} người`);
    xml = replaceParagraph(xml, "1.4.", `1.4. Địa điểm công tác: ${row.location}`);
    xml = replaceParagraph(xml, "1.5.", `1.5. Nội dung công tác: ${row.content}`);
    xml = replaceParagraph(xml, "- Bắt đầu công việc:", `- Bắt đầu công việc: ${plannedDayHour(row.plannedStartAt)}`);
    xml = replaceParagraph(xml, "- Kết thúc công việc:", `- Kết thúc công việc: ${plannedDayHour(row.plannedEndAt)}`);
    const issued = row.issuedAt ? timeParts(row.issuedAt) : null;
    xml = replaceParagraph(xml, "Phiếu công tác cấp ngày", `Phiếu công tác cấp ngày ${issued ? `${issued.day} tháng ${issued.month} năm ${issued.year}` : "... tháng ... năm ………"}`);
    // Phiếu lưu trước khi có ô chức vụ (issuerPosition rỗng): lấy chức vụ trong tài khoản người cấp đã liên kết.
    const issuerPosition = row.issuerPosition?.trim() || (row.issuerUserId
      ? (await prisma.user.findUnique({ where: { id: row.issuerUserId }, select: { position: true } }))?.position?.trim() ?? ""
      : "");
    xml = replaceParagraphAfter(xml, "Người cấp phiếu", "Họ và tên", `Họ và tên: ${row.issuerName || "…………………"}    Chức vụ: ${issuerPosition || "…………………"}    Ký/xác nhận: ……………`);
    xml = replaceParagraphAfter(xml, "Người chỉ huy trực tiếp (", "Họ và tên", "Họ và tên: …………………    Chức vụ: …………………    Ký/xác nhận: ……………");
    if (row.electricalSafetySupervisorName.trim()) xml = replaceParagraphAfter(xml, "Người giám sát an toàn điện", "Họ và tên", `Họ và tên: ${row.electricalSafetySupervisorName.trim()}    Chức vụ: …………………    Ký/xác nhận: ……………`);
  }
  ensureNoTemplateTags(xml);
  if (hasOverhaulQr(row)) xml = await addOverhaulFirstPageQr(zip, xml, row, qrOrigin);
  zip.file("word/document.xml", xml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function createWorkPermitHtml(row: WorkPermit, qrOrigin?: string) {
  const mechanical = row.kind === "MECHANICAL";
  let html = await loadPrintTemplate(mechanical ? "work-permit-mechanical.html" : "work-permit-electrical.html");
  if (mechanical) html = html.replace('<body class="work-permit-mechanical">', '<body class="work-permit-mechanical filled">');
  const selected = (Array.isArray(row.safetyItems) ? row.safetyItems : []) as unknown as SafetySelection[];
  const groups = safetyPrintData(selected);
  const replace = (prefix: string, value: string) => { html = replacePrintParagraph(html, prefix, value); };
  replace("Số:", `Số: ${formatPermitNumber(row)}${!mechanical && row.registrationNumber.trim() ? `\nSố ĐKCT: ${row.registrationNumber.trim()}` : ""}`);
  if (mechanical) {
    html = fillPrintTable(html, "Nhận diện mối nguy", groups.hazards.map((item) => [item.hazard, item.measure]));
    html = fillPrintTable(html, "Kiểm tra các biện pháp an toàn đơn vị cho phép", groups.authorization.map((item) => [item, "", ""]));
    html = fillPrintTable(html, "Kiểm tra các biện pháp an toàn đơn vị công tác", groups.execution.map((item) => [item, "", ""]));
    replace("Địa điểm:", `Địa điểm: ${row.location}`);
    replace("Nội dung:", `Nội dung: ${row.content}`);
    replace("Số ĐK:", row.registrationNumber.trim() ? `Số ĐK: ${row.registrationNumber.trim()}` : "");
    replace("Phạm vi:", `Phạm vi: ${row.workScope || "…………………"}`);
    replace("[  ] Thủy", Object.entries(PERMIT_DISCIPLINES).map(([key, label]) => `[${row.disciplines.includes(key) ? "X" : "  "}] ${label}`).join("        "));
    replace("Thời gian:", `Thời gian: Từ ${plannedTime(row.plannedStartAt)} đến ${plannedTime(row.plannedEndAt)}`);
    const authorizationMoment = compactSignatureMoment(row.authorizedAt);
    replace("Người cấp phiếu:", `Người cấp phiếu: ${row.issuerName || "…………"}       .Chữ ký: ……………       ${signatureMoment(row.issuedAt)}`);
    html = replacePrintParagraphMarkup(html, "Người cho phép:", signatureLineHtml("Người cho phép", row.authorizerName, authorizationMoment));
    html = replacePrintParagraphMarkup(html, "Người CHTT:", signatureLineHtml("Người CHTT", "", authorizationMoment));
    replace("Đơn vị công tác:", `Đơn vị công tác: ${row.teamName}       Số lượng người: …………`);
  } else {
    replace("1.1.", `1.1. Người lãnh đạo công việc (nếu có): ${row.leaderName}`);
    replace("1.2.", "1.2. Người chỉ huy trực tiếp: …………………………………………………………");
    replace("1.3.", `1.3. Nhân viên đơn vị công tác: ${row.printWorkerCount ?? "…………"} người`);
    replace("1.4.", `1.4. Địa điểm công tác: ${row.location}`);
    replace("1.5.", `1.5. Nội dung công tác: ${row.content}`);
    replace("- Bắt đầu công việc:", `- Bắt đầu công việc: ${plannedTime(row.plannedStartAt)}`);
    replace("- Kết thúc công việc:", `- Kết thúc công việc: ${plannedTime(row.plannedEndAt)}`);
    replace("Phiếu công tác cấp ngày", `Phiếu công tác cấp ngày ${row.issuedAt ? row.issuedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "…………………"}`);
    replace("Họ và tên", `Họ và tên: ${row.issuerName}    Chức vụ: ……………    Ký/xác nhận: ……………`);
    if (row.electricalSafetySupervisorName.trim()) replace("Họ và tên:………… .chức vụ", `Họ và tên: ${row.electricalSafetySupervisorName.trim()}    Chức vụ: ……………    Ký/xác nhận: ……………`);
  }
  html = assertPrintFilled(html);
  if (hasOverhaulQr(row)) html = await addOverhaulQrHtml(html, row, qrOrigin);
  return html;
}
