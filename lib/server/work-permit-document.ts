import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import sharp from "sharp";
import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library";
import { prisma } from "@/lib/prisma";
import type { WorkPermit } from "@prisma/client";
import { formatPermitNumber, PERMIT_DISCIPLINES, PERMIT_UNITS } from "@/lib/work-permits";
import { safetyPrintData, type SafetySelection } from "@/lib/work-permit-safety";
import { assertPrintFilled, fillPrintTable, loadPrintTemplate, replacePrintParagraph } from "@/lib/print-html";
import { workPermitQrValue } from "@/lib/work-permit-qr";

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
function ensureNoTemplateTags(xml: string) {
  const tags = [...plain(xml).matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim());
  if (tags.length) throw new Error(`Mẫu PCT còn thẻ chưa được điền: ${[...new Set(tags)].join(", ")}`);
}

const QR_SIZE_EMU = 1_440_000; // 4 cm; vừa khung camera điện thoại khi cầm trang A4 ở khoảng cách gần.
const QR_RELATIONSHIP_ID = "rIdWorkPermitQr";
const QR_MEDIA_PATH = "word/media/work-permit-qr.png";

function hasOverhaulQrPage(row: WorkPermit) {
  return Boolean(row.id) && row.teamType === "CONTRACTOR" && row.contractorScope === "OVERHAUL";
}

async function workPermitQrPng(row: WorkPermit, qrOrigin?: string) {
  const value = workPermitQrValue(row.id, qrOrigin);
  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.MARGIN, 4);
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints);
  let pathData = "";
  for (let y = 0; y < matrix.getHeight(); y++) {
    for (let x = 0; x < matrix.getWidth(); x++) if (matrix.get(x, y)) pathData += `M${x} ${y}h1v1h-1z`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.getWidth()} ${matrix.getHeight()}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${pathData}" fill="#000"/></svg>`;
  return sharp(Buffer.from(svg)).resize(600, 600, { kernel: "nearest" }).png().toBuffer();
}

function qrTextParagraph(text: string, options: { bold?: boolean; size?: number; before?: number; after?: number } = {}) {
  const size = options.size ?? 24;
  return `<w:p><w:pPr><w:spacing w:before="${options.before ?? 80}" w:after="${options.after ?? 80}"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/>${options.bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;
}

function qrImageParagraph() {
  return `<w:p><w:pPr><w:spacing w:before="180" w:after="180"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${QR_SIZE_EMU}" cy="${QR_SIZE_EMU}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="9001" name="Mã QR PCT Đại tu"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="work-permit-qr.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${QR_RELATIONSHIP_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${QR_SIZE_EMU}" cy="${QR_SIZE_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function appendOverhaulQrPage(zip: PizZip, xml: string, row: WorkPermit, qrOrigin?: string) {
  const png = await workPermitQrPng(row, qrOrigin);
  zip.file(QR_MEDIA_PATH, png);
  const relationshipsPath = "word/_rels/document.xml.rels";
  let relationships = zip.file(relationshipsPath)?.asText();
  if (!relationships) throw new Error("Mẫu PCT thiếu quan hệ tài liệu Word");
  relationships = relationships.replace("</Relationships>", `<Relationship Id="${QR_RELATIONSHIP_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/work-permit-qr.png"/></Relationships>`);
  zip.file(relationshipsPath, relationships);
  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = zip.file(contentTypesPath)?.asText();
  if (!contentTypes) throw new Error("Mẫu PCT thiếu khai báo kiểu nội dung");
  if (!/<Default\b[^>]*Extension="png"/i.test(contentTypes)) {
    contentTypes = contentTypes.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
    zip.file(contentTypesPath, contentTypes);
  }
  if (!xml.includes('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"')) {
    xml = xml.replace("<w:document ", '<w:document xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ');
  }
  const unit = PERMIT_UNITS[row.unit as keyof typeof PERMIT_UNITS] ?? row.unit;
  const planned = row.plannedStartAt || row.plannedEndAt
    ? `Thời gian dự kiến: ${row.plannedStartAt ? plannedDayHour(row.plannedStartAt) : "chưa ghi"} — ${row.plannedEndAt ? plannedDayHour(row.plannedEndAt) : "chưa ghi"}`
    : "";
  const page = [
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    qrTextParagraph("MÃ QR PCT ĐẠI TU", { bold: true, size: 36, before: 200, after: 120 }),
    qrImageParagraph(),
    qrTextParagraph(`PCT ${formatPermitNumber(row)}`, { bold: true, size: 32, after: 160 }),
    qrTextParagraph(`Nội dung công việc: ${row.content || "—"}`, { bold: true, size: 26 }),
    qrTextParagraph(`Thiết bị / vị trí: ${row.location || "—"}`),
    qrTextParagraph(`Đơn vị nhà thầu: ${row.teamName || "—"}`),
    row.workScope ? qrTextParagraph(`Phạm vi công tác: ${row.workScope}`, { after: 60 }) : "",
    planned ? qrTextParagraph(planned, { after: 160 }) : "",
    qrTextParagraph("Quét bằng chức năng Quét QR trên duyenhai1.vn để mở bước cho phép làm việc.", { bold: true, size: 22, before: 180 }),
    qrTextParagraph(unit, { size: 20, before: 40 }),
  ].join("");
  const withPage = xml.replace(/(<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*<\/w:body>)/, `${page}$1`);
  if (withPage === xml) throw new Error("Không chèn được trang QR vào cuối mẫu PCT");
  return withPage;
}

async function overhaulQrHtml(row: WorkPermit, qrOrigin?: string) {
  const png = await workPermitQrPng(row, qrOrigin);
  const unit = PERMIT_UNITS[row.unit as keyof typeof PERMIT_UNITS] ?? row.unit;
  const line = (label: string, value: string) => `<p style="margin:8px 0;font-size:12pt"><strong>${escape(label)}:</strong> ${escape(value || "—")}</p>`;
  return `<section style="box-sizing:border-box;break-before:page;page-break-before:always;min-height:257mm;padding:22mm 20mm;text-align:center;font-family:'Times New Roman',serif;color:#111"><h1 style="margin:0 0 14px;font-size:18pt">MÃ QR PCT ĐẠI TU</h1><img alt="Mã QR PCT Đại tu" src="data:image/png;base64,${png.toString("base64")}" style="display:block;width:4cm;height:4cm;margin:0 auto 14px"/><h2 style="margin:0 0 18px;font-size:16pt">PCT ${escape(formatPermitNumber(row))}</h2>${line("Nội dung công việc", row.content)}${line("Thiết bị / vị trí", row.location)}${line("Đơn vị nhà thầu", row.teamName)}${row.workScope ? line("Phạm vi công tác", row.workScope) : ""}${row.plannedStartAt || row.plannedEndAt ? line("Thời gian dự kiến", `${row.plannedStartAt ? plannedDayHour(row.plannedStartAt) : "chưa ghi"} — ${row.plannedEndAt ? plannedDayHour(row.plannedEndAt) : "chưa ghi"}`) : ""}<p style="margin:22px 0 0;font-size:11pt;font-weight:bold">Quét bằng chức năng Quét QR trên duyenhai1.vn để mở bước cho phép làm việc.</p><p style="margin:8px 0 0;font-size:10pt">${escape(unit)}</p></section>`;
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
    const authorizationMoment = signatureMoment(row.authorizedAt);
    xml = replaceParagraph(xml, "Người cấp phiếu:", `Người cấp phiếu: ${row.issuerName || "…………"}       Chữ ký: ……………       ${signatureMoment(row.issuedAt)}`);
    xml = replaceParagraph(xml, "Người cho phép:", `Người cho phép: ${row.authorizerName || "…………"}       Chữ ký: ……………       ${authorizationMoment}`);
    xml = replaceParagraph(xml, "Người CHTT:", `Người CHTT: ${row.commanderName || "…………"}       Chữ ký: ……………       ${authorizationMoment}`);
    xml = replaceParagraph(xml, "Đơn vị công tác:", `Đơn vị công tác: ${row.teamName}       Số lượng người: ${row.workerCount ?? "………"}`);
  } else {
    xml = replaceParagraph(xml, "1.1.", `1.1. Người lãnh đạo công việc (nếu có): ${row.leaderName}`);
    xml = replaceParagraph(xml, "1.2.", `1.2. Người chỉ huy trực tiếp: ${row.commanderName}`);
    xml = replaceParagraph(xml, "1.3.", `1.3. Nhân viên đơn vị công tác: ${row.workerCount ?? "………"} người`);
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
    // Mục 3 "Người chỉ huy trực tiếp (ký/xác nhận)": cùng người với mục 1.2 nên điền tên CHTT luôn.
    xml = replaceParagraphAfter(xml, "Người chỉ huy trực tiếp (", "Họ và tên", `Họ và tên: ${row.commanderName || "…………………"}    Chức vụ: …………………    Ký/xác nhận: ……………`);
    if (row.electricalSafetySupervisorName.trim()) xml = replaceParagraphAfter(xml, "Người giám sát an toàn điện", "Họ và tên", `Họ và tên: ${row.electricalSafetySupervisorName.trim()}    Chức vụ: …………………    Ký/xác nhận: ……………`);
  }
  ensureNoTemplateTags(xml);
  if (hasOverhaulQrPage(row)) xml = await appendOverhaulQrPage(zip, xml, row, qrOrigin);
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
    const authorizationMoment = signatureMoment(row.authorizedAt);
    replace("Người cấp phiếu:", `Người cấp phiếu: ${row.issuerName || "…………"}       .Chữ ký: ……………       ${signatureMoment(row.issuedAt)}`);
    replace("Người cho phép:", `Người cho phép: ${row.authorizerName || "…………"}       .Chữ ký: ……………       ${authorizationMoment}`);
    replace("Người CHTT:", `Người CHTT: ${row.commanderName || "…………"}       Chữ ký: …………       ${authorizationMoment}`);
    replace("Đơn vị công tác:", `Đơn vị công tác: ${row.teamName}       Số lượng người: ${row.workerCount ?? "………"}`);
  } else {
    replace("1.1.", `1.1. Người lãnh đạo công việc (nếu có): ${row.leaderName}`);
    replace("1.2.", `1.2. Người chỉ huy trực tiếp: ${row.commanderName}`);
    replace("1.3.", `1.3. Nhân viên đơn vị công tác: ${row.workerCount ?? "………"} người`);
    replace("1.4.", `1.4. Địa điểm công tác: ${row.location}`);
    replace("1.5.", `1.5. Nội dung công tác: ${row.content}`);
    replace("- Bắt đầu công việc:", `- Bắt đầu công việc: ${plannedTime(row.plannedStartAt)}`);
    replace("- Kết thúc công việc:", `- Kết thúc công việc: ${plannedTime(row.plannedEndAt)}`);
    replace("Phiếu công tác cấp ngày", `Phiếu công tác cấp ngày ${row.issuedAt ? row.issuedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "…………………"}`);
    replace("Họ và tên", `Họ và tên: ${row.issuerName}    Chức vụ: ……………    Ký/xác nhận: ……………`);
    if (row.electricalSafetySupervisorName.trim()) replace("Họ và tên:………… .chức vụ", `Họ và tên: ${row.electricalSafetySupervisorName.trim()}    Chức vụ: ……………    Ký/xác nhận: ……………`);
  }
  html = assertPrintFilled(html);
  if (hasOverhaulQrPage(row)) html = html.replace("</body>", `${await overhaulQrHtml(row, qrOrigin)}</body>`);
  return html;
}
